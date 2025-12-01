# 아키텍처 및 설계 보완 포인트

이 문서는 `docs/concept.md`에서 정의한 전체 구조를 바탕으로, 아키텍처 수준의 설계 결정을 명시적으로 정리합니다. 주로 **번역 방향/제품 스펙**, **레이어 및 컴포넌트 구조**, **Job/상태 모델**, **스토리지/파일 수명**, **배포/스케일링 전략**, **PDF 레이아웃 정책**, **도메인 모델**에 초점을 둡니다.

---

## 1. 번역 방향 및 제품 스펙 정의

### 1.1 지원 언어 및 기본 방향

- **지원 언어 쌍**
  - v1: **영어 논문 → 한국어 번역 (영→한)** 을 기본 시나리오로 지원합니다.
  - 이후 확장: 한→영, 양방향 번역을 고려하되, v1 설계는 영→한에 최적화합니다.

- **입력/출력 단위**
  - 입력: PDF 파일(주로 학술 논문, 학회지, Preprint 등)
  - 출력: 한국어로 번역된 PDF (논문 형식을 최대한 유지하는 문서)

### 1.2 API 관점 스펙 개요

- `POST /upload`
  - Request: PDF 파일 (필수)
  - 향후 확장 파라미터(설계만):
    - `source_lang` (기본값: `en`)
    - `target_lang` (기본값: `ko`)
  - Response: `{ job_id: string }`

- `GET /status/{job_id}`
  - Response: `{ job_id, status, progress?, error_code?, error_message? }`

- `GET /download/{job_id}`
  - 성공 시 번역된 PDF 파일 스트리밍

상세 API 파라미터/스키마는 별도 OpenAPI 스펙에 정의하며, 본 문서에서는 **아키텍처 관점의 책임 분리**에 집중합니다.

---

## 2. 레이어 및 컴포넌트 구조

### 2.1 레이어 개요

- **Presentation Layer (Web/API)**
  - FastAPI 기반 REST API
  - 파일 업로드/상태 조회/다운로드 엔드포인트 제공

- **Application/Service Layer**
  - `TranslationService`
    - PDF → 내부 구조 모델 변환 의존 (PDFParser)
    - 번역 대상 텍스트 추출 및 청크 나누기
    - LLMClient를 통한 번역 호출 및 결과 조합
  - `PDFService`
    - 번역된 내부 구조 모델 → PDF 바이트로 렌더링

- **Infrastructure Layer**
  - `PDFParser` (PyMuPDF 등)
  - `PDFGenerator` (WeasyPrint/ReportLab 등)
  - `LLMClient` (OpenAI 등 LLM 래퍼)
  - `Storage` (원본/번역 파일 및 중간 산출물 저장)
  - `JobRepository` (Job 상태 저장/조회)
  - `JobQueue` (Celery/RQ 기반 비동기 처리)

### 2.2 의존성 방향

- 상위 레이어가 하위 레이어에만 의존하도록 합니다.
  - Presentation → Application → Infrastructure 순.
  - Infrastructure 구현체 교체(예: 로컬 FS → S3)가 상위 코드에 영향을 최소화하도록 인터페이스/추상화를 사용합니다.

---

## 3. Job/상태 관리 모델 설계

### 3.1 Job 엔티티 개요

Job은 “하나의 논문 번역 요청”을 의미합니다.

- 필수 필드 (예시)
  - `id: string` (UUID)
  - `status: enum` — `PENDING | RUNNING | COMPLETED | FAILED`
  - `created_at: datetime`
  - `updated_at: datetime`
  - `source_lang: string` (기본 `en`)
  - `target_lang: string` (기본 `ko`)
  - `page_count: int` (파싱 시 계산)
  - `error_code: string | null`
  - `error_message: string | null`
  - `expires_at: datetime` (TTL 기반 삭제 시점)

### 3.2 상태 전이 규칙

- `PENDING` → `RUNNING`
  - 워커가 Job을 픽업할 때 전이.
- `RUNNING` → `COMPLETED`
  - 번역 + PDF 생성 성공, 번역 파일 저장 완료 시점.
- `RUNNING` → `FAILED`
  - 치명적 오류(파싱 실패, LLM 연속 실패, PDF 렌더링 실패 등) 발생 시.

상태 전이는 **JobRepository**를 통해 일관된 트랜잭션 단위로 처리하여, 중간 상태에서의 레이스 컨디션을 줄입니다.

### 3.3 재시도 전략

- LLM/네트워크 오류 등 일시 오류에 대해서는 **Job 내부에서 청크 단위 재시도**를 우선 고려합니다.
- 동일 Job의 전체 재시도는 별도 API 또는 운영 콘솔에서 수동으로 트리거하는 것을 기본으로 합니다.

---

## 4. 스토리지 및 파일 수명(TTL) 전략

### 4.1 저장 위치 추상화

- `Storage` 인터페이스(또는 클래스)를 정의해 구현체 교체를 용이하게 합니다.
  - `save_original(job_id, file)`
  - `save_translated(job_id, pdf_bytes)`
  - `get_original_path(job_id)` / `get_translated_path(job_id)`
  - `delete_original(job_id)` / `delete_translated(job_id)`

### 4.2 TTL 및 정리 정책

- 기본 정책 (예시)
  - Job 생성 후 **N일(예: 7일)** 이 지나면 원본/번역 PDF를 삭제합니다.
  - `expires_at` 필드에 만료 시점을 기록합니다.

- 정리 방식
  - 배치 작업(예: Celery beat, cron job)이 주기적으로 만료 Job을 스캔 후 파일/레코드 삭제.
  - 삭제 후에도 최소 수준의 메타데이터(Job ID, created_at, status 등)만 남길지 여부는 운영 요구에 따라 결정.

---

## 5. 로컬 FS vs 다중 인스턴스/클라우드 스토리지

### 5.1 개발/로컬 환경

- 단일 인스턴스 + 로컬 디렉터리 구조 사용
  - `./data/original/{job_id}.pdf`
  - `./data/translated/{job_id}.pdf`

### 5.2 프로덕션/스케일 아웃 환경

- 여러 API/Worker 인스턴스가 존재할 수 있으므로, **공유 스토리지** 사용을 전제로 합니다.
  - 예: AWS S3, GCS, NFS 등

- 설계 원칙
  - 애플리케이션 레벨에서는 파일이 “경로”가 아닌 “Storage key”로 식별되도록 설계합니다.
  - 다운로드 시 API 서버는 Storage에서 직접 스트리밍하거나, 프리사인드 URL을 반환하는 패턴을 사용할 수 있습니다.

---

## 6. PDF 레이아웃/구조 유지 정책

### 6.1 목표 수준 정의

- v1 목표
  - **내용(텍스트) 정확도**를 우선.
  - 기본적인 논문 구조(제목, 섹션 헤더, 본문 문단, 그림/표 캡션 구분)를 유지.

- 비목표(초기 버전에서 명시적으로 제공하지 않음)
  - 원본과 100% 동일한 페이지 레이아웃, 줄바꿈, 폰트, 수식 위치.
  - 복잡한 수식/도표의 재조합.

### 6.2 구현 방향

- `PDFParser`는 페이지별로 **Block 단위의 구조**를 추출합니다.
  - 타입 예: `title`, `heading(level)`, `paragraph`, `caption`, `table`, `equation` 등.

- 번역 시 텍스트 Block만 대상으로 하되, **수식/표/그림**은 다음과 같이 처리합니다.
  - 수식: 가능하면 텍스트로 인라인 표현, 아니면 이미지 그대로 유지.
  - 표/그림: 캡션 텍스트는 번역, 실제 이미지는 원본 사용.

- `PDFGenerator` 단계에서는
  - 논문 스타일에 가까운 기본 템플릿(폰트, 마진, 컬럼 구조 등)을 정의하고,
  - Block 타입에 따라 스타일을 다르게 적용합니다.

---

## 7. 도메인 모델 정의 (요약)

내부적으로 번역 파이프라인은 다음과 같은 도메인 모델을 사용합니다. 실제 구현에서는 Pydantic 모델로 정의하는 것을 권장합니다.

- `BlockType`
  - 값 예시: `title`, `heading`, `paragraph`, `caption`, `equation`, `table` 등.

- `Block`
  - `id: string`
  - `type: BlockType`
  - `text: string` (번역 대상/결과 텍스트)
  - `meta: dict` (폰트, 위치, 스타일 등 선택적 정보)

- `Page`
  - `page_number: int`
  - `blocks: list[Block]`

- `Document`
  - `pages: list[Page]`
  - `title: string | null`
  - `meta: dict` (저자, 저널 등 메타데이터)

`TranslationService`는 `Document`를 입력받아, 각 `Block`의 `text`를 번역한 뒤, 동일한 구조를 유지한 새로운 `Document`(번역본)를 반환하는 것을 목표로 합니다.

---

## 8. 요약

- 본 문서는 논문 번역 서비스의 아키텍처 관점에서
  - 번역 방향/제품 스펙,
  - 레이어/컴포넌트 구조,
  - Job/상태 모델,
  - 스토리지 및 TTL,
  - 멀티 인스턴스 환경에서의 스토리지 전략,
  - PDF 레이아웃 정책,
  - 내부 도메인 모델
  을 정의했습니다.

이 정의를 기준으로, 다른 섹션(운영, 보안, 구현 상세) 문서와 함께 일관된 설계 결정을 이어나갑니다.
