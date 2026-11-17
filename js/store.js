// データ保存層。Firebase（Firestore）かローカル（localStorage）のどちらかで動く。
// どちらも同じ API: start(onChange) / add / update / remove / replaceAll / signOut
import { firebaseConfig } from "./firebase-config.js";

export const COLLECTIONS = ["strategies", "goals", "mons"];

const FB = "https://www.gstatic.com/firebasejs/10.12.2";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- ローカル ---------- */
class LocalStore {
  constructor() {
    this.mode = "local";
    this.key = "pss-data-v1";
    this.data = { strategies: {}, goals: {}, mons: {} };
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* 読めなくても空で起動 */ }
  }
  async start(onChange) { this.onChange = onChange; this.emit(); }
  async needLogin() { return false; }
  emit() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 保存失敗は無視 */ }
    this.onChange && this.onChange(structuredClone(this.data));
  }
  async add(col, obj) {
    const id = newId();
    const now = Date.now();
    this.data[col][id] = { ...obj, createdAt: now, updatedAt: now };
    this.emit();
    return id;
  }
  async update(col, id, obj) {
    this.data[col][id] = { ...this.data[col][id], ...obj, updatedAt: Date.now() };
    this.emit();
  }
  async remove(col, id) { delete this.data[col][id]; this.emit(); }
  async replaceAll(all) {
    this.data = { strategies: {}, goals: {}, mons: {}, ...all };
    this.emit();
  }
  async signOut() {}
  userLabel() { return "ローカルモード（この端末のみ）"; }
}

/* ---------- Firebase ---------- */
class FirebaseStore {
  constructor() { this.mode = "firebase"; }

  async init() {
    const appMod = await import(`${FB}/firebase-app.js`);
    const authMod = await import(`${FB}/firebase-auth.js`);
    const fsMod = await import(`${FB}/firebase-firestore.js`);
    this.a = authMod;
    this.f = fsMod;
    const app = appMod.initializeApp(firebaseConfig);
    this.auth = authMod.getAuth(app);
    // オフラインでも直近のデータを表示・編集できるように端末内キャッシュを有効化
    this.db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
    this.user = await new Promise((resolve) => {
      const off = authMod.onAuthStateChanged(this.auth, (u) => { off(); resolve(u); });
    });
  }

  async needLogin() { return !this.user; }

  async signIn() {
    const provider = new this.a.GoogleAuthProvider();
    try {
      await this.a.signInWithPopup(this.auth, provider);
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
        await this.a.signInWithRedirect(this.auth, provider);
        return;
      }
      throw e;
    }
    this.user = this.auth.currentUser;
  }

  colRef(col) { return this.f.collection(this.db, "users", this.user.uid, col); }

  async start(onChange) {
    const data = { strategies: {}, goals: {}, mons: {} };
    let ready = 0;
    COLLECTIONS.forEach((col) => {
      let first = true;
      this.f.onSnapshot(this.colRef(col), (snap) => {
        data[col] = {};
        snap.forEach((d) => { data[col][d.id] = d.data(); });
        if (first) { first = false; ready++; }
        if (ready === COLLECTIONS.length) onChange(structuredClone(data));
      });
    });
  }

  async add(col, obj) {
    const now = Date.now();
    const ref = this.f.doc(this.colRef(col));
    await this.f.setDoc(ref, { ...obj, createdAt: now, updatedAt: now });
    return ref.id;
  }
  async update(col, id, obj) {
    await this.f.updateDoc(this.f.doc(this.colRef(col), id), { ...obj, updatedAt: Date.now() });
  }
  async remove(col, id) { await this.f.deleteDoc(this.f.doc(this.colRef(col), id)); }

  // バックアップの読み込み: 既存データを全削除してから書き込む
  async replaceAll(all) {
    const ops = [];
    for (const col of COLLECTIONS) {
      const snap = await this.f.getDocs(this.colRef(col));
      snap.forEach((d) => ops.push(["del", d.ref]));
      for (const [id, v] of Object.entries(all[col] || {})) {
        ops.push(["set", this.f.doc(this.colRef(col), id), v]);
      }
    }
    // Firestore のバッチ上限(500)に合わせて分割
    for (let i = 0; i < ops.length; i += 400) {
      const batch = this.f.writeBatch(this.db);
      ops.slice(i, i + 400).forEach(([kind, ref, v]) => {
        if (kind === "del") batch.delete(ref); else batch.set(ref, v);
      });
      await batch.commit();
    }
  }

  async signOut() { await this.a.signOut(this.auth); }
  userLabel() { return this.user ? `${this.user.displayName || ""}（Googleでログイン中）` : ""; }
}

export async function createStore() {
  if (!firebaseConfig) return new LocalStore();
  const s = new FirebaseStore();
  await s.init();
  return s;
}
