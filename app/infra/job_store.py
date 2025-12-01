import time
from typing import Optional

from redis import Redis


class JobStore:
    def __init__(self, redis_url: str):
        self._redis = Redis.from_url(redis_url, decode_responses=True)

    def _status_key(self, job_id: str) -> str:
        return f"job:{job_id}:status"

    def _created_at_key(self, job_id: str) -> str:
        return f"job:{job_id}:created_at"

    def create_job(self, job_id: str) -> None:
        pipe = self._redis.pipeline()
        pipe.set(self._status_key(job_id), "PENDING")
        pipe.set(self._created_at_key(job_id), int(time.time()))
        pipe.execute()

    def set_status(self, job_id: str, status: str) -> None:
        self._redis.set(self._status_key(job_id), status)

    def get_status(self, job_id: str) -> Optional[str]:
        return self._redis.get(self._status_key(job_id))
