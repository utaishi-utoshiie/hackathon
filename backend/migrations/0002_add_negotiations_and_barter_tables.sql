-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

CREATE TABLE IF NOT EXISTS negotiations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT NOT NULL,
  buyer_id BIGINT NOT NULL,
  seller_id BIGINT NOT NULL,
  buyer_budget INT NOT NULL,
  desire_level VARCHAR(20) NOT NULL,
  agreed_price INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  negotiation_log TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_negotiations_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_negotiations_buyer FOREIGN KEY (buyer_id) REFERENCES users(id),
  CONSTRAINT fk_negotiations_seller FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS barter_loops (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  justification TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS barter_loop_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  loop_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  receiver_id BIGINT NOT NULL,
  cash_adjustment INT NOT NULL DEFAULT 0,
  shipping_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_barter_members_loop FOREIGN KEY (loop_id) REFERENCES barter_loops(id) ON DELETE CASCADE,
  CONSTRAINT fk_barter_members_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_barter_members_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_barter_members_receiver FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ai_interactions_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  item_id BIGINT NULL,
  feature_type VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_log_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_ai_log_item FOREIGN KEY (item_id) REFERENCES items(id)
);

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back

DROP TABLE IF EXISTS ai_interactions_log;
DROP TABLE IF EXISTS barter_loop_members;
DROP TABLE IF EXISTS barter_loops;
DROP TABLE IF EXISTS negotiations;
