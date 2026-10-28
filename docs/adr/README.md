# 設計判断の記録（ADR）

Architecture Decision Record。大きな設計判断を、「状況」「決めたこと」「検討した他の案」「結果として受け入れたこと」の形で1件ずつ残しています。コードを読んで「なぜこうなっているのか」と思ったときの答えがここにあります。

| 番号 | 判断 |
| --- | --- |
| [0001](0001-split-typescript-and-python.md) | 画面・APIはTypeScript、分析はPythonの別サービスに分ける |
| [0002](0002-stateless-analyzer.md) | データベースを持つのはAPIだけにし、分析サービスは状態を持たない |
| [0003](0003-contract-test-between-languages.md) | 2言語のやり取りを契約テストで守る |
| [0004](0004-explainable-recommendations.md) | おすすめは説明できる方法（文章の類似度）で作り、生成AIは使わない |
| [0005](0005-official-data-sources-only.md) | 購入履歴と商品は公式に取れる方法だけで集める |
| [0006](0006-idempotent-imports.md) | 取り込みは何度やり直しても同じ結果になるようにする |
| [0007](0007-cache-analysis-per-data-version.md) | 分析結果はデータのバージョンごとにキャッシュする |
| [0008](0008-static-demo-and-shared-importer.md) | 公開デモはサーバー不要の静的版にし、取り込み処理を共有する |
