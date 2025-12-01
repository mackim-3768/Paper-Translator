---
trigger: manual
---

# Paper-Translator – Windsurf Rules

## 1. 전체 원칙

- **[설계 우선]**
  - [docs/concept.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/concept.md:0:0-0:0)와 `docs/section/*.md`에 정의된 아키텍처/운영/보안/구현 원칙을 **최우선 기준**으로 따른다.
  - 코드 변경/신규 기능 제안 시, 가능하면 “어느 설계 문서 내용을 따른 것인지”를 명시한다.

- **[레이어드 아키텍처 유지]**
  - Presentation → Application(Service) → Infrastructure 의 단방향 의존성만 허용한다.
  - 상위 레이어에서 하위 레이어 구현 세부에 직접 의존하지 않도록 주의한다.

- **[작게, 명확하게]**
  - 한 PR/커밋은 하나의 논리적인 변경에 초점을 맞춘다 (예: 엔드포인트 추가, Storage 구현 교체 등).
  - 설계와 어긋나는 변경이 필요하면, 먼저 이유를 설명하고 설계 문서를 갱신하는 것을 우선 제안한다.

---

## 2. 코드 구조 및 책임 분리

- **[디렉터리 구조]**
  - 가능한 한 [docs/concept.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/concept.md:0:0-0:0)의 예시를 따른다:
    - `app/main.py` – FastAPI 엔트리
    - `app/api/*` – 라우트 정의 (`/upload`, `/status`, `/download`)
    - `app/services/*` – `TranslationService`, `PDFService` 등 비즈니스 로직
    - `app/infra/*` – `pdf_parser`, `pdf_generator`, `llm_client`, `storage`, `jobs`
    - `app/models/*` – Job 및 도메인 모델 정의
    - `app/templates/*` – HTML 템플릿 (업로드 폼, 번역 결과 등)

- **[엔드포인트 규칙]**
  - FastAPI 라우트 함수에서는:
    - 인증/인가, 요청 검증, 서비스 호출, 응답 변환만 담당한다.
    - PDF 파싱/번역/저장 같은 로직은 서비스/infra 계층으로 위임한다.

- **[서비스 계층 규칙]**
  - `TranslationService`는:
    - Document 구조 로딩 → 청크 분리 → LLM 번역 → 구조 재조립까지의 “번역 파이프라인”만 담당한다.
    - LLM 클라이언트, Storage, Parser, Generator 등은 모두 DI(의존성 주입) 또는 인터페이스를 통해 사용한다.
  - `PDFService`는:
    - 논문 구조 → PDF bytes 변환만 담당하며, 번역/Job 상태 변경 로직은 포함하지 않는다.

- **[Infrastructure 규칙]**
  - `PDFParser`, `PDFGenerator`, `LLMClient`, `Storage`, `JobRepository`, `JobQueue`는 **구체 기술에 종속된 구현부**로, 상위 계층에 인터페이스/추상 타입만 노출한다.
  - 로컬 FS ↔ S3, OpenAI ↔ 다른 LLM 교체가 가능하도록 구현 세부를 상위 계층에 새지 않게 한다.

---

## 3. Job/에러/로그 처리 규칙

- **[Job 모델]**
  - Job 상태는 설계 문서([architecture.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/section/architecture.md:0:0-0:0)) 내용에 맞춰 사용:
    - `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`
  - 상태 전이는 항상 `JobRepository` 혹은 전담 서비스 함수를 통해 수행한다.

- **[에러 응답 형식]**
  - API 에러 응답은 [implementation.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/section/implementation.md:0:0-0:0)에 정의된 공통 스키마를 따른다:
    - `{"error": {"code", "message", "details?"}, "request_id": "..."}` 형식 유지.
  - HTTP Status ↔ 에러 코드 매핑(400/401/403/404/429/500 등)을 명시적으로 맞춘다.

- **[로깅 & Correlation ID]**
  - 구조화 로그(최소 JSON 또는 key=value) 사용.
  - 모든 요청/Job 관련 로그에는 가능한 한 다음 필드를 포함:
    - `request_id`, `job_id`, `owner_id`, `path`, `status`, `duration_ms`.
  - `X-Request-ID` 헤더를 사용해 Correlation ID를 전파하고, 응답 헤더와 에러 바디에 포함한다.

---

## 4. 성능/운영/보안 관련 규칙

- **[성능 및 제한]**
  - 파일 크기, 페이지 수 제한 등 정책은 [operations.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/section/operations.md:0:0-0:0)에 맞춘다.
  - LLM 호출은 청크 단위로 나누고, 모델의 최대 토큰 한도를 넘지 않도록 보호 로직을 반드시 넣는다.
  - 큐 길이, 동시 번역 Job 수, 동시 LLM 요청 수 등은 설정값으로 관리하고, 하드코딩하지 않는다.

- **[보안/프라이버시]**
  - 모든 외부 API는 인증 필수 (최소 API Key 기반).
  - Job 접근 시 `job_id`만으로 허용하지 말고, 설계 문서([security.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/section/security.md:0:0-0:0)) 기준으로 **owner 검증**을 수행한다.
  - 로그에는 원문/번역 텍스트를 남기지 않는다.
  - LLM 키, DB/Redis/S3 자격 증명 등 시크릿은 **환경 변수 또는 시크릿 매니저**를 통해 주입하고, 코드에 하드코딩하지 않는다.

---

## 5. Windsurf / AI 사용 규칙

- **[설계 우선 탐색]**
  - 새로운 코드/구조를 제안하거나 생성하기 전에:
    - 먼저 [docs/concept.md](cci:7://file:///home/dgkim/source/Paper-Translator/docs/concept.md:0:0-0:0)와 관련 `docs/section/*.md`를 검색/열람해서 기존 설계에 맞출 것.
  - 설계와 다르게 구현해야 한다면, 그 이유와 영향을 설명하고, 가능하면 문서 수정까지 제안할 것.

- **[수정 범위 최소화]**
  - 요청이 특정 파일/함수에 대한 것이라면, 그 범위를 넘는 대규모 리팩터링/디렉터리 이동은 **사용자에게 먼저 확인** 후 진행한다.
  - README나 문서(`docs/*`)는 사용자가 명시적으로 요청한 경우에만 수정한다.

- **[명시적 설명]**
  - 자동 생성한 코드/설정에 대해서는:
    - 어느 설계 문서를 근거로 했는지,
    - 어떤 선택(예: PyMuPDF vs pdfplumber, WeasyPrint vs ReportLab)을 했는지
    를 간단히 한국어로 설명한다.

- **[LLM 호출 코드]**
  - LLM 호출 관련 코드는:
    - 재시도/백오프, 타임아웃, Rate Limit 보호 로직을 포함하는 전용 모듈에서만 작성한다.
    - 엔드포인트/서비스 레벨에서 직접 OpenAI SDK를 새로 호출하지 않는다.

---

## 6. 문서/README 관리

- **[문서 싱크]**
  - 아키텍처/운영/보안/구현에 중대한 변경이 생기면:
    - 먼저 `docs/section/*.md`에 설계를 반영하고,
    - 그 다음 README의 요약 섹션을 필요 시 업데이트한다.
  - Windsurf가 설계와 다른 구현을 제안할 때는, 항상 “문서도 함께 업데이트해야 하는지”를 검토한다.