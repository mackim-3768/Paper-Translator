import time

from celery import Celery

from app.config import settings
from app.infra.job_store import JobStore


celery_app = Celery(
    "paper_translator",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

job_store = JobStore(settings.redis_url)


@celery_app.task(name="translate_paper")
def translate_paper(job_id: str) -> dict:
    """더미 번역 Job.

    실제 구현에서는 PDF 파싱 → 청크 분리 → LLM 번역 → PDF 생성 로직이 들어간다.
    여기서는 Job 상태 전이만 테스트용으로 구현한다.
    """

    job_store.set_status(job_id, "RUNNING")
    time.sleep(2)
    job_store.set_status(job_id, "COMPLETED")
    return {"job_id": job_id, "status": "COMPLETED"}
