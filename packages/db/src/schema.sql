-- 어디있지 스키마
-- 이 파일이 유일한 진실이다. 마이그레이션은 idempotent 하게 작성한다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 수집된 매물. 검색 캐시가 만료돼도 남아 재검색·중복판별·SEO에 재사용된다.
CREATE TABLE IF NOT EXISTS listings (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT        NOT NULL,
  source_item_id  TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  norm_title      TEXT        NOT NULL,
  price           INTEGER     NOT NULL,
  url             TEXT        NOT NULL,
  region          TEXT,
  posted_at       TIMESTAMPTZ,
  sold            BOOLEAN     NOT NULL DEFAULT FALSE,
  pro_seller      BOOLEAN     NOT NULL DEFAULT FALSE,
  thumbnail_url   TEXT,
  product_id      TEXT,
  kind            TEXT        NOT NULL DEFAULT 'item',
  storage_gb      INTEGER,
  color           TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT listings_source_item_uniq UNIQUE (source, source_item_id)
);

-- 해외 매물 지원. 기존 테이블에도 안전하게 붙도록 ADD COLUMN IF NOT EXISTS 로 쓴다.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS currency     TEXT        NOT NULL DEFAULT 'KRW';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_krw    INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_type TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS ends_at      TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS bid_count    INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS shipping_fee INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id    TEXT;

-- price_krw 가 비어 있는 과거 행은 원화 매물이므로 price 를 그대로 쓴다
UPDATE listings SET price_krw = price WHERE price_krw IS NULL;

CREATE INDEX IF NOT EXISTS listings_price_krw_idx ON listings (price_krw);

CREATE INDEX IF NOT EXISTS listings_product_idx    ON listings (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_posted_idx     ON listings (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS listings_price_idx      ON listings (price);
CREATE INDEX IF NOT EXISTS listings_last_seen_idx  ON listings (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS listings_kind_idx       ON listings (kind);
-- 소스가 죽었을 때 우리 인덱스만으로 폴백 검색을 하기 위한 트라이그램 인덱스
CREATE INDEX IF NOT EXISTS listings_title_trgm_idx ON listings USING GIN (norm_title gin_trgm_ops);

-- 검색 결과 캐시. 같은 질의로 남의 서버를 반복해서 때리지 않기 위한 것.
CREATE TABLE IF NOT EXISTS search_cache (
  key         TEXT        PRIMARY KEY,
  term        TEXT        NOT NULL,
  payload     JSONB       NOT NULL,
  sources     JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS search_cache_expires_idx ON search_cache (expires_at);

-- 번역하지 못한 한글 검색어. 굿즈 사전을 무엇으로 채워야 하는지 알려주는 유일한 신호다.
CREATE TABLE IF NOT EXISTS untranslated_term (
  term        TEXT        PRIMARY KEY,
  hits        INTEGER     NOT NULL DEFAULT 1,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved    BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS untranslated_hits_idx ON untranslated_term (hits DESC) WHERE NOT resolved;

-- 검색 로그. 인기 검색어·예열 대상 선정·수요 데이터의 원천.
CREATE TABLE IF NOT EXISTS query_log (
  id            BIGSERIAL   PRIMARY KEY,
  term          TEXT        NOT NULL,
  normalized    TEXT        NOT NULL,
  product_id    TEXT,
  result_count  INTEGER     NOT NULL DEFAULT 0,
  took_ms       INTEGER     NOT NULL DEFAULT 0,
  cached        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS query_log_created_idx    ON query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS query_log_normalized_idx ON query_log (normalized);

-- 소스 상태 이력. "번개장터가 언제부터 안 되는지" 를 사람이 알 수 있어야 한다.
CREATE TABLE IF NOT EXISTS source_health (
  id          BIGSERIAL   PRIMARY KEY,
  source      TEXT        NOT NULL,
  ok          BOOLEAN     NOT NULL,
  count       INTEGER     NOT NULL DEFAULT 0,
  duration_ms INTEGER     NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS source_health_created_idx ON source_health (source, created_at DESC);

-- 키워드 알림.
-- 계정을 만들지 않는다. 브라우저의 푸시 구독(endpoint)이 곧 신원이다.
-- 로그인 없이 알림을 받을 수 있고, 우리는 개인정보를 갖지 않는다.
CREATE TABLE IF NOT EXISTS alert (
  id               BIGSERIAL   PRIMARY KEY,
  -- 푸시 구독 endpoint 의 해시. 원문 대신 해시를 키로 써서 로그에 흘러도 재사용할 수 없게 한다.
  endpoint_hash    TEXT        NOT NULL,
  -- web-push 가 필요로 하는 구독 객체 {endpoint, keys:{p256dh, auth}}
  subscription     JSONB       NOT NULL,
  term             TEXT        NOT NULL,
  scope            TEXT        NOT NULL DEFAULT 'domestic',
  filters          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- 이미 알린 매물 키. 등록 시각이 아니라 이걸로 "새 매물"을 판단한다.
  seen_ids         TEXT[]      NOT NULL DEFAULT '{}',
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  -- 연속 실패 횟수. 구독이 죽으면(410/404) 스스로 정리한다.
  fail_count       INTEGER     NOT NULL DEFAULT 0,
  last_checked_at  TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  notify_count     INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alert_uniq UNIQUE (endpoint_hash, term, scope)
);

CREATE INDEX IF NOT EXISTS alert_active_idx  ON alert (active, last_checked_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS alert_endpoint_idx ON alert (endpoint_hash);
