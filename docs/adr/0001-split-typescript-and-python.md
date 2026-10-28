# 0001 画面・APIはTypeScript、分析はPythonの別サービスに分ける

## 状況
- 画面・入力検証・保存は、画面とサーバーで同じ型を使えると間違いが減る。
- 集計・テキストの数値化・機械学習は、pandas・scikit-learn などPythonの道具が最も揃っている。

## 決めたこと
- 画面（React）とAPI（Hono）はTypeScriptで書き、型（zodスキーマ）を `packages/shared` で共有する。
- 分析はPython（FastAPI）の独立したサービスにし、HTTPのJSONでやり取りする。

## 検討した他の案
- **すべてPython（Django など）**：分析はしやすいが、画面と型を共有できない。
- **すべてTypeScript**：型は1つにできるが、統計・機械学習の道具が弱く、分析を自作する部分が増える。
- **Pythonを子プロセスとして呼ぶ**：サービスは1つで済むが、障害の切り分けや個別の再起動・台数追加ができない。

## 受け入れたこと
- 動かす部品が1つ増え、サービス間の通信失敗を考える必要がある（→ [0003](0003-contract-test-between-languages.md)）。
- ローカルで動かすにはDocker Composeを使う前提になる。
