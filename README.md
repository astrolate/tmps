@batch.route("/<path:subpath>")
class BatchProxyResource(Resource):
    def post(self, subpath: str):
        # --- ここはリクエストコンテキスト内。今のうちに全部抜き取る ---
        app = current_app._get_current_object()

        try:
            target_url = _normalize_target_path(subpath)
        except ValueError as e:
            return {"error": str(e)}, 400

        # ヘッダは request から今のうちにスナップショット
        forward_headers = _pick_forward_headers()  # 内部で request.headers を読むならここで完成させる
        # 認証連携用のスナップショット（プロキシ終端型を想定）
        remote_user = request.environ.get("REMOTE_USER")
        # アプリ側でSPNEGOを直接受ける構成なら Authorization も事前取得
        auth_header = request.headers.get("Authorization")
        if auth_header:
            forward_headers["Authorization"] = auth_header  # 念のため明示的に保持

        payload = request.get_json(silent=True)
        if not isinstance(payload, list):
            return {"error": "Request body must be a JSON array"}, 400

        default_workers = int(app.config.get("BATCH_MAX_WORKERS", 8))
        try:
            req_workers = int(request.args.get("workers", default_workers))
        except (TypeError, ValueError):
            req_workers = default_workers
        max_workers = max(1, min(req_workers, 64))

        def worker(idx_item, app=app, target_url=target_url,
                   headers=forward_headers, remote_user=remote_user):
            idx, item = idx_item
            # スレッド側では request を絶対に参照しない
            with app.app_context():
                with app.test_client() as client:
                    environ = {}
                    if remote_user:
                        environ["REMOTE_USER"] = remote_user  # プロキシ終端の認証結果を継承
                    resp = client.post(
                        target_url,
                        json=item,
                        headers=headers,
                        environ_overrides=environ
                    )
                    try:
                        body = resp.get_json()
                    except Exception:
                        body = resp.get_data(as_text=True)
                    return {"index": idx, "status": resp.status_code,
                            "ok": 200 <= resp.status_code < 300, "body": body}

        items = list(enumerate(payload))
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            results = list(ex.map(worker, items))

        results.sort(key=lambda r: r["index"])
        any_ok = any(r["ok"] for r in results)
        return {
            "target": target_url,
            "count": len(results),
            "results": results,
            "workers": max_workers,
        }, (200 if any_ok else 502)
