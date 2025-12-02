import time
from typing import Dict, List, Optional

import psycopg2


class JobRepository:
    """PostgreSQL 기반 Job 상태 저장소.

    필드:
    - id: Job ID (UUID 문자열)
    - status: PENDING/RUNNING/COMPLETED/FAILED 등
    - created_at / updated_at: Unix epoch (초)
    - file_name: 업로드된 파일명 (선택)
    - page_count: 페이지 수 (선택)
    - error_code: 오류 코드 (선택)
    - owner_id: 소유자/클라이언트 식별자 (선택)
    - expires_at: 만료 시각(epoch 초, 선택)
    """

    def __init__(self, db_url: str):
        self._db_url = db_url
        self._ensure_schema()

    def _get_conn(self):
        return psycopg2.connect(self._db_url)

    def _ensure_schema(self) -> None:
        """jobs 테이블이 없으면 생성하고, 필요한 컬럼을 보강합니다."""

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                # 기본 테이블 생성
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                        id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        file_name TEXT,
                        page_count INTEGER,
                        error_code TEXT,
                        owner_id TEXT,
                        expires_at BIGINT
                    )
                    """
                )

                # 이전 버전에서 생성된 테이블을 위한 방어적 ALTER
                cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS file_name TEXT")
                cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS page_count INTEGER")
                cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_code TEXT")
                cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS owner_id TEXT")
                cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at BIGINT")

                conn.commit()

    def create_job(
        self,
        job_id: str,
        *,
        file_name: Optional[str] = None,
        owner_id: Optional[str] = None,
        page_count: Optional[int] = None,
        expires_at: Optional[int] = None,
    ) -> None:
        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO jobs (
                        id,
                        status,
                        created_at,
                        updated_at,
                        file_name,
                        page_count,
                        error_code,
                        owner_id,
                        expires_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE
                    SET status = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at,
                        file_name = COALESCE(EXCLUDED.file_name, jobs.file_name),
                        page_count = COALESCE(EXCLUDED.page_count, jobs.page_count),
                        owner_id = COALESCE(EXCLUDED.owner_id, jobs.owner_id),
                        expires_at = COALESCE(EXCLUDED.expires_at, jobs.expires_at)
                    """,
                    (
                        job_id,
                        "PENDING",
                        now,
                        now,
                        file_name,
                        page_count,
                        None,
                        owner_id,
                        expires_at,
                    ),
                )
                conn.commit()

    def set_status(self, job_id: str, status: str) -> None:
        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (status, now, job_id),
                )
                conn.commit()

    def set_page_count(self, job_id: str, page_count: int) -> None:
        """Job의 page_count를 업데이트한다."""

        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET page_count = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (page_count, now, job_id),
                )
                conn.commit()

    def get_status(self, job_id: str) -> Optional[str]:
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
                row = cur.fetchone()
        if not row:
            return None
        return row[0]

    def get_job(self, job_id: str) -> Optional[Dict]:
        """단일 Job의 전체 정보를 조회한다.

        존재하지 않으면 None을 반환한다.
        """

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        status,
                        created_at,
                        updated_at,
                        file_name,
                        page_count,
                        error_code,
                        owner_id,
                        expires_at
                    FROM jobs
                    WHERE id = %s
                    """,
                    (job_id,),
                )
                row = cur.fetchone()

        if not row:
            return None

        (
            job_id,
            status,
            created_at,
            updated_at,
            file_name,
            page_count,
            error_code,
            owner_id,
            expires_at,
        ) = row

        return {
            "jobId": job_id,
            "lastStatus": status,
            "createdAt": created_at * 1000 if created_at is not None else None,
            "lastUpdatedAt": updated_at * 1000 if updated_at is not None else None,
            "fileName": file_name,
            "pageCount": page_count,
            "errorCode": error_code,
            "ownerId": owner_id,
            "expiresAt": expires_at,
        }

    def list_jobs(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> List[Dict]:
        """Job 목록 조회 (Dashboard/RDB 기반 조회용).

        반환 형식은 프런트엔드 Dashboard가 기대하는 형태에 맞습니다.
        - jobId, fileName, lastStatus, createdAt(ms), lastUpdatedAt(ms), pageCount, errorCode, ownerId, expiresAt
        """

        params: List = []
        where_clauses: List[str] = []

        if search:
            like = f"%{search.lower()}%"
            where_clauses.append(
                "("  # id / file_name / status 간단 검색
                "LOWER(id) LIKE %s OR "
                "LOWER(COALESCE(file_name, '')) LIKE %s OR "
                "LOWER(status) LIKE %s"
                ")"
            )
            params.extend([like, like, like])

        # status_filter: 'all' | 'active' | 'expired'
        filt = (status_filter or "all").lower()
        now = int(time.time())
        if filt == "expired":
            where_clauses.append("expires_at IS NOT NULL AND expires_at <= %s")
            params.append(now)
        elif filt == "active":
            where_clauses.append("(expires_at IS NULL OR expires_at > %s)")
            params.append(now)

        where_clause = ""
        if where_clauses:
            where_clause = "WHERE " + " AND ".join(where_clauses)

        params.extend([limit, offset])

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT
                        id,
                        status,
                        created_at,
                        updated_at,
                        file_name,
                        page_count,
                        error_code,
                        owner_id,
                        expires_at
                    FROM jobs
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    params,
                )
                rows = cur.fetchall()

        items: List[Dict] = []
        for (
            job_id,
            status,
            created_at,
            updated_at,
            file_name,
            page_count,
            error_code,
            owner_id,
            expires_at,
        ) in rows:
            created_ms = created_at * 1000 if created_at is not None else None
            updated_ms = updated_at * 1000 if updated_at is not None else None
            items.append(
                {
                    "jobId": job_id,
                    "lastStatus": status,
                    "createdAt": created_ms,
                    "lastUpdatedAt": updated_ms,
                    "fileName": file_name,
                    "pageCount": page_count,
                    "errorCode": error_code,
                    "ownerId": owner_id,
                    "expiresAt": expires_at,
                }
            )
        return items

    def get_expired_jobs(self, *, now: Optional[int] = None, limit: int = 100) -> List[Dict]:
        """만료 시각(expires_at)이 현재 시각 이전인 Job 목록을 조회한다.

        TTL 정리 작업에서 사용된다.
        """

        ts = now or int(time.time())

        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        status,
                        created_at,
                        updated_at,
                        file_name,
                        page_count,
                        error_code,
                        owner_id,
                        expires_at
                    FROM jobs
                    WHERE expires_at IS NOT NULL
                      AND expires_at <= %s
                    ORDER BY expires_at ASC
                    LIMIT %s
                    """,
                    (ts, limit),
                )
                rows = cur.fetchall()

        items: List[Dict] = []
        for (
            job_id,
            status,
            created_at,
            updated_at,
            file_name,
            page_count,
            error_code,
            owner_id,
            expires_at,
        ) in rows:
            created_ms = created_at * 1000 if created_at is not None else None
            updated_ms = updated_at * 1000 if updated_at is not None else None
            items.append(
                {
                    "jobId": job_id,
                    "lastStatus": status,
                    "createdAt": created_ms,
                    "lastUpdatedAt": updated_ms,
                    "fileName": file_name,
                    "pageCount": page_count,
                    "errorCode": error_code,
                    "ownerId": owner_id,
                    "expiresAt": expires_at,
                }
            )
        return items

    def set_error(self, job_id: str, error_code: str, status: str = "FAILED") -> None:
        """Job에 오류 코드를 기록하고 상태를 갱신한다.

        기본 상태는 FAILED 이며, updated_at 도 함께 갱신된다.
        """

        now = int(time.time())
        with self._get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = %s,
                        error_code = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (status, error_code, now, job_id),
                )
                conn.commit()
