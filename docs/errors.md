# API error codes

Errors use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details
(`application/problem+json`). Branch on `code`; `title` and `detail` are for people.

| code | HTTP | Meaning |
| --- | --- | --- |
| <a id="validation_failed"></a>`validation_failed` | 400 | The request body is missing fields or has invalid values. `detail` lists them. |
| <a id="not_found"></a>`not_found` | 404 | The purchase (or path) does not exist. |
| <a id="demo_read_only"></a>`demo_read_only` | 403 | The public demo does not accept changes. Run it locally to import data. |
| <a id="nothing_to_import"></a>`nothing_to_import` | 422 | No row of the file could be read. `detail` explains the first problem. |
| <a id="analyzer_unavailable"></a>`analyzer_unavailable` | 502 | The analysis service did not answer, or its answer did not match the contract. |
| `internal_error` | 500 | A bug. The server log has the details. |
