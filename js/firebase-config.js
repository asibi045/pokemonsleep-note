// Firebase の設定。Firebase コンソールの「プロジェクトの設定 → マイアプリ」に表示される
// firebaseConfig の中身をここに貼り付ける（SETUP.md 手順4）。
// これらの値はブラウザに公開される前提のもので、秘密情報ではありません。
// データは firestore.rules により、ログインした本人しか読み書きできません。
//
// null のままだと「ローカルモード」で動きます（この端末のブラウザにだけ保存。お試し用）。
export const firebaseConfig = {
  apiKey: "AIzaSyAfujcv-OOlgRni2mUqK_YKiVj2XvncKHQ",
  authDomain: "pokemonsleep-note.firebaseapp.com",
  projectId: "pokemonsleep-note",
  storageBucket: "pokemonsleep-note.firebasestorage.app",
  messagingSenderId: "148741277983",
  appId: "1:148741277983:web:59cab899907ac41e98c82a",
};

/* 貼り付け例:
export const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
*/
