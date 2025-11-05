# batch_ns.py（抜粋）
import asyncio
from typing import Any, Dict
from flask import request, current_app
from flask_restx import Namespace, Resource, abort

def _coerce_jsonable(obj: Any) -> Any:
    from decimal import Decimal
    import datetime, uuid
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, (datetime.datetime, datetime.date, datetime.time, Decimal, uuid.UUID)):
        return str(obj)
    if isinstance(obj, dict):
        return {str(k): _coerce_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_coerce_jsonable(v) for v in obj]
    return str(obj)

@batch.route("/<path:subpath>")
class BatchProxyResource(Resource):
    def post(self, subpath: str):
        key = subpath.strip("/")
        handler = _HANDLER_REGISTRY.get(key)
        if handler is None:
            abort(404, f"Unknown subpath: {key}")

        payload = request.get_json(silent=True)
        if not isinstance(payload, list):
            abort(400, "Request body must be a JSON array.")

        normalized, seen = [], set()
        for i, item in enumerate(payload):
            if not isinstance(item, dict) or "id" not in item or "data" not in item:
                abort(400, f"Array item at index {i} must include 'id' and 'data'.")
            _id = item["id"]
            if _id in seen:
                abort(400, f"Duplicate 'id' detected: {_id}")
            seen.add(_id)
            normalized.append({"id": _id, "data": item["data"]})

        workers = request.args.get("workers", type=int) or min(8, max(1, len(normalized)))
        timeout = request.args.get("timeout", type=float)  # 秒
        app = current_app._get_current_object()

        async def run_all():
            sem = asyncio.Semaphore(workers)
            results = []

            async def run_one(_id: str, data: Dict[str, Any]):
                async with sem:
                    def _impl():
                        with app.app_context():
                            return handler(data)
                    try:
                        value = await asyncio.to_thread(_impl)
                        results.append({"id": _id, "ok": True, "result": _coerce_jsonable(value)})
                    except Exception as e:
                        results.append({"id": _id, "ok": False, "error": str(e)})

            tasks = [run_one(it["id"], it["data"]) for it in normalized]
            # 完了順で append したいので as_completed 相当で待つ
            for coro in asyncio.as_completed(tasks, timeout=timeout):
                try:
                    await coro
                except asyncio.TimeoutError:
                    # タイムアウトした分は後で拾えないので明示的にエラーとして記録
                    results.append({"id": "<timeout>", "ok": False, "error": "timeout"})
            return results

        results = asyncio.run(run_all())
        status = _decide_status(results)
        return {
            "subpath": key,
            "count": len(results),
            "succeeded": sum(1 for r in results if r.get("ok")),
            "failed": sum(1 for r in results if r and not r.get("ok")),
            "items": results,            # 完了順
            "parallelism": {"max_workers": workers, "timeout": timeout},
        }, status