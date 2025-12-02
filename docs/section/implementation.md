# 구현 및 환경설정 보완 포인트

이 문서는 논문 번역 서비스의 **구현 세부 전략**과 **환경설정 구조**를 정의합니다. 특히

- 표준 에러 응답 포맷 및 로깅 전략
- 요청/Job 단위 Correlation ID 설계
- 환경변수/설정 관리 구조 (LLM 키, DB, RabbitMQ, S3 등)
- Dev/Prod 분리 전략 및 설정 프로필

을 다룹니다.

---

## 1. 표준 에러 응답 포맷

### 1.1 공통 에러 응답 스키마

모든 API 에러 응답은 다음 JSON 포맷을 기본으로 합니다.

```jsonc
{
  "error": {
    "code": "string",        // 머신이 해석 가능한 에러 코드
    "message": "string",     // 사용자/클라이언트용 메시지
    "details": {               // 선택적 상세 정보
      "field": "...",
      "hint": "..."
    }
  },
  "request_id": "string"      // Correlation ID (2장 참조)
}
```

### 1.2 HTTP 상태 코드 매핑 예시

- 400 Bad Request
  - 잘못된 파라미터, 지원하지 않는 파일 형식, 업로드 크기/페이지 제한 초과 등.
- 401 Unauthorized / 403 Forbidden
  - 인증 실패, 권한 부족.
- 404 Not Found
  - 존재하지 않는 `job_id` 또는 접근 권한 없는 Job.
- 409 Conflict (선택)
  - 중복 요청, 이미 처리 중인 Job에 대한 특정 갱신 충돌 등.
- 429 Too Many Requests
  - Rate Limit 초과.
- 500 Internal Server Error
  - 예기치 못한 서버 오류.

에러 코드는 서비스 내부적으로 다음과 같이 네임스페이스를 둘 수 있습니다 (예시).

- `VALIDATION_*` — 요청 검증 관련 오류
- `AUTH_*` — 인증/인가 관련 오류
- `JOB_*` — Job 상태/존재 관련 오류
- `LLM_*` — LLM 호출/토큰 관련 오류
- `PDF_*` — PDF 파싱/렌더링 관련 오류

---

## 2. 로깅 전략

### 2.1 로깅 원칙

- **구조화 로그(Structured Logging)** 사용
  - JSON 포맷 또는 key=value 포맷으로 로그를 남겨, 검색/집계에 유리하게 함.
- 로그 레벨 사용
  - `DEBUG` — 개발/디버깅용 상세 정보 (운영에서는 제한)
  - `INFO` — 정상 흐름(요청 수락, Job 상태 변경 등)
  - `WARN` — 비정상 상황이지만 자동 복구 가능
  - `ERROR` — 요청 실패, Job 실패 등 사용자 영향 있는 오류
  - `CRITICAL` — 시스템 장애 수준

### 2.2 요청 단위 로깅 필드

- 모든 요청 처리 로그에 공통 필드 포함
  - `request_id` — Correlation ID (2장)
  - `path` — 요청 경로
  - `method` — HTTP 메서드
  - `status` — 응답 HTTP 상태 코드
  - `duration_ms` — 처리 시간
  - `owner_id` — 인증 토큰/사용자 기준 식별자(가능한 경우)

### 2.3 Job 단위 로깅

- Job 상태 전이 시 로그를 남깁니다.
  - `job_id`, `old_status`, `new_status`, `reason`, `error_code` 등.
- LLM 호출 실패/재시도, PDF 파싱/렌더링 오류도 Job 컨텍스트와 함께 로그에 포함.

---

## 3. Correlation ID 설계

### 3.1 개념

- Correlation ID는 **하나의 요청 또는 일련의 연관 작업**을 추적하기 위한 ID입니다.
- HTTP 요청 단위 `request_id`와 Job 단위 `job_id`를 모두 활용하여, 문제 발생 시 전체 흐름을 재구성할 수 있게 합니다.

### 3.2 생성 및 전파 규칙

- HTTP 요청 수신 시
  - 헤더 `X-Request-ID`가 존재하면 해당 값을 사용.
  - 없으면 새 UUID를 생성하여 `request_id`로 사용.

- 서버 응답
  - 항상 `X-Request-ID` 헤더로 `request_id`를 반환.
  - 에러 응답 바디에도 `request_id`를 포함.

- Job 처리
  - `/upload` 요청 처리 시 생성된 `request_id`를 Job 메타데이터에 선택적으로 저장.
  - 워커 로직에서 주요 로그에 `job_id`와 함께 `request_id`를 포함해, 앞단 요청과 연계 추적 가능하게 함.

---

## 4. 환경변수 및 설정 관리

### 4.1 설정 계층 구조

- **환경변수 (env)**
  - 민감 정보 및 환경별로 달라지는 값(OpenAI 키, DB/Redis/S3 접속 정보 등)을 제공.

- **Settings 객체**
  - Pydantic `BaseSettings` 등을 이용해 환경변수를 읽어, 애플리케이션 내부에서 타입 안정적으로 사용.

### 4.2 주요 설정 항목 예시

- 애플리케이션 기본
  - `APP_ENV` — `dev`, `staging`, `prod` 등
  - `APP_LOG_LEVEL` — 로그 레벨

- LLM 관련
  - `LLM_PROVIDER` — `openai` 등
  - `OPENAI_API_KEY`
  - `LLM_MODEL` — 예: `gpt-4.1-mini`

- 스토리지/DB/RabbitMQ
  - `STORAGE_BACKEND` — `local`, `s3` 등
  - `S3_BUCKET`, `S3_REGION` 등 (해당 시)
  - `DB_URL` (Job/메타데이터 보관용)
  - `RABBITMQ_URL` (비동기 Job 큐용)

- 운영 정책
  - `MAX_UPLOAD_SIZE_MB`
  - `MAX_PAGES`
  - `JOB_TTL_DAYS`

### 4.3 설정 로딩 패턴

- 애플리케이션 시작 시 Settings 인스턴스를 한 번 생성하고, DI(의존성 주입) 또는 전역 설정 객체로 공유.
- 테스트에서는 별도 `.env.test` 또는 환경 변수 override를 통해 설정.

### 4.4 스토리지 및 TTL 설정 구체화

- Settings 예시 (실제 코드 기준)
  - `data_dir` — 원본/번역 PDF를 저장하는 루트 디렉터리 (예: `/data`).
  - `storage_backend` — 스토리지 구현 선택 (`local`, 향후 `s3` 등 확장).
  - `job_ttl_days` — Job 생성 시점 기준 기본 보관 일수 (예: 7일).
- 환경변수 매핑 예시 (env prefix 사용 시)
  - `APP_DATA_DIR`, `APP_STORAGE_BACKEND`, `APP_JOB_TTL_DAYS` 등으로 설정 가능.
- 동작 요약
  - `/upload` 처리 시 Job 생성과 함께 `expires_at = created_at + job_ttl_days`를 설정.
  - Celery Task `cleanup_expired_jobs`가 `expires_at`이 지난 Job의
    원본/번역 PDF를 `Storage`를 통해 정리.
  - `/jobs` API는 `statusFilter` 값에 따라 `expires_at`을 기준으로
    active/expired Job을 서버 측에서 필터링.

---

## 5. Dev/Prod 분리 및 설정 프로필

### 5.1 환경 구분

- `APP_ENV` 값에 따라 동작 모드를 나눕니다.
  - `dev` — 로컬 개발 환경
  - `staging` — 사전 검증 환경
  - `prod` — 운영 환경

### 5.2 환경별 차이 예시

- Dev
  - 상세 로그(`DEBUG`) 허용.
  - 로컬 파일 스토리지 사용 (`./data`)
  - 작은 Rate Limit, 소규모 LLM 사용량.

- Staging
  - Prod와 거의 동일한 설정이지만, 별도 리소스/키 사용.
  - 실제 트래픽 대신 테스트/QA용 트래픽.

- Prod
  - 최소 권한/필요 최소 정보만 노출.
  - 공유 스토리지(S3 등), 강화된 Rate Limit/보안 설정.

### 5.3 설정 프로필 관리

- Docker/K8s 환경을 가정할 경우, 환경별로 다른 `ConfigMap`/`Secret`을 사용.
- 로컬 개발은 `.env.dev`, 테스트는 `.env.test` 등으로 구분 가능 (단, Git 커밋 금지).

---

## 6. 요약

- 본 문서는 구현 관점에서
  - 일관된 에러 응답 포맷,
  - 구조화 로깅 및 Correlation ID,
  - 환경변수/Settings 기반 설정 관리,
  - Dev/Prod 환경 분리 및 설정 프로필
  을 정의합니다.

이 정의를 기준으로 실제 코드 구현 시, 다른 설계 문서(architecture/operations/security)에서 정한 원칙들을 구체적으로 반영합니다.
