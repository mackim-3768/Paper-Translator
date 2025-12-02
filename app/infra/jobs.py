from pathlib import Path
import time
from typing import Optional

from celery import Celery

from app.config import settings
from app.infra.job_repository import JobRepository
from app.infra.storage import get_storage
from app.services.translation_service import TranslationService


celery_app = Celery(
    "paper_translator",
    broker=settings.rabbitmq_url,
    backend="rpc://",
)

job_store = JobRepository(settings.db_url)
translation_service = TranslationService()
storage = get_storage()


@celery_app.task(name="translate_paper")
def translate_paper(job_id: str) -> dict:
    """실제 번역 Job.

    /data/original/{job_id}.pdf 를 읽어 LLM 번역 후
    /data/translated/{job_id}.pdf 로 저장한다.
    """

    job_store.set_status(job_id, "RUNNING")

    original_path = Path(storage.get_original_path(job_id))
    translated_path = Path(storage.get_translated_path(job_id))

    if not original_path.exists():
        job_store.set_error(job_id, "ORIGINAL_PDF_NOT_FOUND")
        raise FileNotFoundError(f"Original PDF not found for job_id={job_id}")

    try:
        # 페이지 수 계산 (메타데이터 저장용)
        try:
            page_count = translation_service.get_page_count(original_path)
        except Exception:
            page_count = None

        translation_service.translate_pdf(original_path, translated_path)
    except Exception:
        job_store.set_error(job_id, "TRANSLATION_FAILED")
        raise

    if page_count is not None:
        job_store.set_page_count(job_id, page_count)

    job_store.set_status(job_id, "COMPLETED")
    return {"job_id": job_id, "status": "COMPLETED"}


def cleanup_expired_jobs_impl(*, now: Optional[int] = None, limit: int = 100) -> int:
    """만료된 Job의 원본/번역 파일을 정리한다.

    - JobRepository 에서 expires_at <= now 인 Job 목록을 조회하고,
    - Storage 를 통해 original/translated 파일을 삭제한다.

    반환값은 정리한 Job 개수이다.
    """

    ts = now or int(time.time())
    expired_jobs = job_store.get_expired_jobs(now=ts, limit=limit)

    for item in expired_jobs:
        job_id = item["jobId"]
        storage.delete_original(job_id)
        storage.delete_translated(job_id)

    return len(expired_jobs)


@celery_app.task(name="cleanup_expired_jobs")
def cleanup_expired_jobs(limit: int = 100) -> int:
    """만료 Job 정리용 Celery Task.

    주기적인 실행은 Celery Beat 또는 외부 스케줄러에서 호출하는 것을 전제로 한다.
    """

    return cleanup_expired_jobs_impl(limit=limit)
