# Paper-Translator

## 개요

- 영어 논문 PDF를 업로드하면, LLM을 사용해 한국어로 번역된 PDF를 생성하는 서비스입니다.
- 논문의 레이아웃/섹션 구조는 최대한 유지하되, **내용(텍스트) 정확도**를 우선합니다.
- 현재 레포는 서비스 구현 전에 사용할 **설계/아키텍처 문서**를 중심으로 구성되어 있습니다.

## 주요 기능 (목표)

- 논문 PDF 업로드 (`POST /upload`)
- 비동기 Job 기반 번역 처리 및 상태 조회 (`GET /status/{job_id}`)
- 번역 결과 PDF 다운로드 (`GET /download/{job_id}`)
- 긴 논문을 위한 청크 단위 번역, 재시도/에러 처리, 스토리지 TTL 관리

## 전체 아키텍처 요약

- **Presentation Layer (Web/API)**
  - FastAPI 기반 REST API
  - 파일 업로드 / 상태 조회 / 다운로드 엔드포인트 제공

- **Application / Service Layer**
  - `TranslationService`
    - PDF → 내부 문서 구조 모델 변환 (PDFParser에 의존)
    - 번역 대상 텍스트 추출 및 청크 나누기
    - LLM 번역 호출 및 결과 조합
  - `PDFService`
    - 번역된 문서 구조를 PDF 바이트로 렌더링

- **Infrastructure Layer**
  - `PDFParser` (PyMuPDF 등)
  - `PDFGenerator` (WeasyPrint / ReportLab 등)
  - `LLMClient` (OpenAI 등 LLM 래퍼)
  - `Storage` (원본/번역 파일 및 중간 산출물 저장)
  - `JobQueue` (Celery/RQ + Redis 기반 비동기 처리)
  - `JobRepository` (Job 메타데이터 및 상태 관리)

## 제안 기술 스택

- **언어/런타임**: Python
- **Web/API**: FastAPI
- **비동기 처리**: Celery 또는 RQ + Redis
- **PDF 파싱**: PyMuPDF(fitz), pdfplumber 등
- **PDF 생성**: ReportLab 또는 HTML + WeasyPrint
- **LLM**: OpenAI GPT-4.1 / GPT-4.1-mini (번역용)
- **설정 관리**: Pydantic `BaseSettings` 기반 env 설정, `APP_ENV`로 dev/staging/prod 분리

## 문서 구조

이 레포의 설계 문서는 모두 `docs/` 아래에 있으며, 각 문서는 다음 내용을 다룹니다.

- `docs/concept.md`
  - 서비스 목표 및 기능/비기능 요구사항
  - 전체 아키텍처 개요와 레이어 구조
  - 요청 흐름 (업로드 → 비동기 Job → 상태 조회/다운로드)
  - 디렉터리 구조 예시 및 최소 FastAPI 스켈레톤 코드 예시

- `docs/section/architecture.md`
  - 번역 방향/제품 스펙 (v1: 영어 → 한국어)
  - 레이어 및 컴포넌트 구조 (Presentation / Application / Infrastructure)
  - Job/상태 모델 및 상태 전이 규칙
  - 스토리지 추상화와 파일 TTL/정리 정책
  - PDF 레이아웃 정책 및 내부 도메인 모델 (`Document`, `Page`, `Block` 등)

- `docs/section/operations.md`
  - 성능 목표 (요청 지연, 번역 완료까지의 시간 등)
  - 업로드 파일 크기/페이지 제한 정책
  - 토큰/비용/응답 속도 관리 전략
  - Job 큐 폭주 방지, Rate Limit, 워커 동시성 제어
  - 번역 실패/재시도/일관성 보장 전략
  - 모니터링/알림 및 용량 계획, 스케일링 전략

- `docs/section/security.md`
  - 인증/인가 전략 (API Key → 추후 JWT/OAuth2 확장)
  - job_id 기반 Job 소유권 및 접근 제어
  - 원본/번역/메타/로그 데이터의 보관·삭제 정책
  - 전송(HTTPS) 및 저장(디스크/S3 암호화) 시 보안
  - PDF 파서/렌더러 샌드박싱 및 시크릿 관리 원칙

- `docs/section/implementation.md`
  - 표준 에러 응답 포맷(JSON 스키마)과 HTTP 상태 코드 매핑
  - 구조화 로그 및 요청/Job 단위 Correlation ID 설계
  - 환경변수/Settings 기반 설정 관리 구조
  - Dev/Staging/Prod 환경 분리 및 설정 프로필 운영 전략

## 앞으로의 구현 가이드 (요약)

- `docs/concept.md`에 제안된 디렉터리 구조와 스켈레톤을 기준으로 실제 코드를 구성합니다.
- `docs/section/*.md` 문서에서 정의한 아키텍처/운영/보안/구현 원칙을 각 모듈과 설정에 반영합니다.
- 구현이 진행되면, 이 README에 **설치 방법, 실행 방법, 예제 요청/응답** 등을 단계적으로 추가하는 것을 권장합니다.