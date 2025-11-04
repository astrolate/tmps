# batch_ns.py
from typing import Any, Dict, List, Tuple
from flask import request, current_app
from flask_restx import Namespace, Resource

batch = Namespace("batch", description="Batch proxy for existing endpoints")

def _pick_forward_headers() -> Dict[str, str]:
    """
    フォワード時に引き継ぐヘッダを最小限に制限します。
    認証やトレーシングに必要なものがあればここに追加してください。
    """
    hop_by_hop = {
        "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
        "te", "trailers", "transfer-encoding", "upgrade"
    }
    forward: Dict[str, str] = {}
    for k, v in request.headers.items():
        lk = k.lower()
        if lk in hop_by_hop:
            continue
        # Content-Type は test_client 側で json= を使うので付けない
        if lk == "content-type":
            continue
        forward[k] = v
    return forward

def _normalize_target_path(subpath: str) -> str:
    # /api/batch/... への再帰転送を防止
    cleaned = subpath.lstrip("/")
    if cleaned.startswith("batch/") or cleaned == "batch":
        raise ValueError("subpath must not start with 'batch'")
    # 既存のエンドポイントは /api/ 配下を想定
    return f"/api/{cleaned}"

def _post_once(client, url: str, payload: Any, headers: Dict[str, str]) -> Tuple[int, Any, bool]:
    """単一要素を POST 転送して結果を返す。"""
    # JSON として送る。レスポンスは JSON を試み、だめなら text にフォールバック
    resp = client.post(url, json=payload, headers=headers)
    ok = 200 <= resp.status_code < 300
    body: Any
    try:
        body = resp.get_json()
    except Exception:
        body = resp.get_data(as_text=True)
    return resp.status_code, body, ok

@batch.route("/<path:subpath>")
class BatchProxyResource(Resource):
    def post(self, subpath: str):
        """
        例:
          POST /api/batch/booking/book
          Body: [{...}, {...}, ...]  # /api/booking/book が期待する各ペイロードの配列
        """
        if not request.is_json:
            return {
                "error": "Content-Type must be application/json",
            }, 415

        payload = request.get_json(silent=True)
        if not isinstance(payload, list):
            return {
                "error": "Request body must be a JSON array",
            }, 400

        try:
            target_url = _normalize_target_path(subpath)
        except ValueError as e:
            return {"error": str(e)}, 400

        headers = _pick_forward_headers()

        results: List[Dict[str, Any]] = []
        # 同期で順次処理。必要なら並列化はここを変更（ワーカーやスレッド）で対応。
        with current_app.test_client() as client:
            for idx, item in enumerate(payload):
                status, body, ok = _post_once(client, target_url, item, headers)
                results.append({
                    "index": idx,
                    "status": status,
                    "ok": ok,
                    "body": body,
                })

        # 全体の代表ステータスは 207 Multi-Status 的な意味合いで 207 相当が無いので 200 を返し、
        # 個別要素の成否は results で表現します。全失敗の場合のみ 502 を返すなどの方針もありえます。
        any_ok = any(r["ok"] for r in results)
        http_status = 200 if any_ok else 502
        return {
            "target": target_url,
            "count": len(results),
            "results": results,
        }, http_status



# 置換後: batch_ns.py の BatchProxyResource.post 内の for-loop 部分

from concurrent.futures import ThreadPoolExecutor

@batch.route("/<path:subpath>")
class BatchProxyResource(Resource):
    def post(self, subpath: str):
        ...
        try:
            target_url = _normalize_target_path(subpath)
        except ValueError as e:
            return {"error": str(e)}, 400

        headers = _pick_forward_headers()

        # 並列度の決定（?workers= で上書き可、デフォルトは設定 or CPU*5 程度）
        default_workers = getattr(current_app.config, "BATCH_MAX_WORKERS", 8)
        try:
            req_workers = int(request.args.get("workers", default_workers))
        except (TypeError, ValueError):
            req_workers = default_workers
        max_workers = max(1, min(req_workers, 64))  # 上限で暴走を抑制

        # ワーカー関数: 各要素を独立コンテキスト＋独立クライアントで POST
        def worker(idx_item):
            idx, item = idx_item
            with current_app.app_context():
                with current_app.test_client() as client:
                    status, body, ok = _post_once(client, target_url, item, headers)
                    return {
                        "index": idx,
                        "status": status,
                        "ok": ok,
                        "body": body,
                    }

        items = list(enumerate(payload))
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            results = list(ex.map(worker, items))

        # 入力順で整列（ex.map は順序保持だが、将来 as_completed を使う可能性も考慮）
        results.sort(key=lambda r: r["index"])

        any_ok = any(r["ok"] for r in results)
        http_status = 200 if any_ok else 502
        return {
            "target": target_url,
            "count": len(results),
            "results": results,
            "workers": max_workers,
        }, http_status
