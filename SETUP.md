# 公開までの手順（GitHub Pages ＋ Firebase）

すべて無料の範囲で作業できます。手順のなかで迷ったら、Claude に「手順○で止まった」と画面の状態を伝えてください。

---

## 手順1：Firebase プロジェクトを作る（データの保存先）

1. https://console.firebase.google.com/ を開き、Google アカウントでログインする
2. 「プロジェクトを作成」を押す
   - プロジェクト名：`pokesleep-note` など、好きな名前でよい
   - Google アナリティクスは「無効」でよい
3. プロジェクトができたら、左メニューの「構築 → Authentication」を開いて「始める」を押す
   - 「ログイン方法」で **Google** を選び、「有効にする」をオンにして保存する
4. 左メニューの「構築 → Firestore Database」を開いて「データベースを作成」を押す
   - ロケーション：`asia-northeast1 (東京)`
   - 「本番環境モード」を選ぶ
5. Firestore の「ルール」タブを開き、中身をすべて消して、このフォルダの `firestore.rules` の内容を貼り付けて「公開」を押す
   - このルールにより、ログインした本人だけが自分のデータを読み書きできます

## 手順2：Web アプリを登録する

1. プロジェクトの概要ページで「</>（ウェブ）」アイコンを押す
2. アプリのニックネームは `pokesleep-note` などでよい。「Firebase Hosting」にはチェックを入れない
3. 表示された `const firebaseConfig = { ... };` の `{ ... }` の部分をコピーする
4. 次のどちらかで設定する
   - Claude に貼り付けて、「firebase-config.js に設定して」と頼む
   - 自分で `js/firebase-config.js` を開き、`export const firebaseConfig = null;` の `null` を、コピーした `{ ... }` に置き換える

> この設定値はブラウザに公開される前提の値で、パスワードではありません。GitHub に置いても大丈夫です。データはルールで守られます。

## 手順3：GitHub にファイルを置く

1. https://github.com/ でアカウントを作る（作成済みなら不要）
2. 右上の「＋ → New repository」を押す
   - Repository name：`pokesleep-note`
   - **Public** を選ぶ（無料の GitHub Pages は公開リポジトリが必要です。公開されるのはプログラムだけで、あなたのデータは公開されません）
   - 「Create repository」を押す
3. 作ったリポジトリのページで「uploading an existing file」を押す
4. このフォルダの中身をすべてドラッグ＆ドロップする（`index.html`、`css`、`js` など）
   - `.claude` フォルダはアップロードしなくてよい
5. 下の「Commit changes」を押す

## 手順4：GitHub Pages を有効にする

1. リポジトリの「Settings → Pages」を開く
2. 「Source」で「Deploy from a branch」を選び、Branch を `main`、フォルダを `/ (root)` にして「Save」を押す
3. 1〜2分待つと、`https://＜ユーザー名＞.github.io/pokesleep-note/` で公開される

## 手順5：Firebase にサイトのドメインを許可する

1. Firebase の「Authentication → 設定 → 承認済みドメイン」を開く
2. 「ドメインの追加」で `＜ユーザー名＞.github.io` を追加する

## 手順6：スマホで使う

1. スマホのブラウザで、手順4のURLを開く
2. 「Google でログイン」を押す
3. ホーム画面に追加すると、アプリのように開ける
   - iPhone：Safari の共有ボタン →「ホーム画面に追加」
   - Android：Chrome のメニュー →「ホーム画面に追加」

---

## 更新するとき

Claude にファイルを修正してもらったら、GitHub のリポジトリで「Add file → Upload files」を押し、変わったファイルを同じ場所にアップロードします。1〜2分で反映されます。

## バックアップ

アプリの「設定 → 書き出す」で、全データを JSON ファイルに保存できます。月に1回くらい保存しておくと安心です。
