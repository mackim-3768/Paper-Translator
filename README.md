# Paper-Translator

## 개요

- 영어 논문 PDF를 업로드하면, LLM을 사용해 한국어로 번역된 PDF를 생성하는 서비스입니다.
- 원본 PDF의 **서식과 레이아웃(다단, 줄바꿈, 폰트/크기, 컬럼/각주 위치 등)**을 최대한 그대로 유지하면서, 내용을 한국어로 자연스럽게 번역한 **고품질 번역 PDF**를 생성하는 것을 v1.0.0 목표로 합니다.

자세한 설계/아키텍처/운영/보안 정책은 모두 `docs/` 디렉터리에 정리되어 있으며, README는 **프로젝트 개념과 실행 방법만** 간단히 다룹니다.

## 빠른 시작 (Docker Compose)

### 1. 사전 준비

- Docker, docker-compose 설치
- OpenAI API 키 준비: `OPENAI_API_KEY`

프로젝트 루트에 `.env` 파일을 만들고 다음과 같이 설정합니다.

```bash
OPENAI_API_KEY=sk-...
```

### 2. 컨테이너 실행

프로젝트 루트(`/home/dgkim/source/Paper-Translator` 기준)에서:

```bash
docker-compose up -d
```

- 함께 올라가는 서비스
  - `api` : FastAPI 백엔드 (내부 포트 8000)
  - `worker` : Celery 워커 (비동기 번역 Job 처리)
  - `redis` : Job 큐/상태 저장소
  - `frontend` : React + Nginx 프론트엔드 (포트 8080 노출)

정상 기동 여부는 다음으로 확인할 수 있습니다.

```bash
docker-compose ps
```

### 3. 사용 방법

- 웹 UI (권장)
  - 브라우저에서 `http://localhost:8080` 접속
  - 1. PDF 업로드 → 2. 상태 조회 & 다운로드 순서로 사용

- API 문서
  - `http://localhost:8000/docs` (FastAPI Swagger UI)

### 4. Job 만료(TTL) 및 정리 정책

- Job은 생성 시점 기준 `JOB_TTL_DAYS`(기본 7일) 이후 만료됩니다.
  - 만료된 Job은 `/jobs?statusFilter=expired`에서 조회할 수 있습니다.
  - Dashboard UI는 기본적으로 `statusFilter=all/active/expired`를 사용해 서버 측에서 필터링합니다.
- Celery Task `cleanup_expired_jobs`가 주기적으로 실행되어, 만료된 Job의
  원본/번역 PDF 파일을 로컬 스토리지(`/data` 등)에서 정리합니다.
- TTL 일수와 스토리지 경로는 환경변수(`APP_JOB_TTL_DAYS`, `APP_DATA_DIR`, `APP_STORAGE_BACKEND` 등)로 조정할 수 있습니다.

## 추가 문서

설계/아키텍처/운영상세는 다음 문서를 참고하세요.

- `docs/concept.md` : 서비스 목표, 요구사항, 전체 아키텍처 개요
- `docs/section/architecture.md` : 레이어 구조, 컴포넌트, PDF 레이아웃/구조 정책 등
- `docs/section/operations.md` : 성능/용량/운영/스케일링 전략
- `docs/section/security.md` : 인증/인가, 데이터 보관/삭제, 보안 정책
- `docs/section/implementation.md` : 에러 응답 포맷, 로깅, 설정 관리, 환경 프로필 등