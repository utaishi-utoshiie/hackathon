-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

CREATE INDEX idx_purchases_seller_created_at_price ON purchases (seller_id, created_at, price);
CREATE INDEX idx_items_seller_status_created_at ON items (seller_id, status, created_at);
CREATE INDEX idx_likes_item_user ON likes (item_id, user_id);
CREATE INDEX idx_images_item_sort_url ON item_images (item_id, sort_order, image_url(255));
CREATE INDEX idx_reviews_ee_rating ON user_reviews (reviewee_id, rating);

-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back

DROP INDEX idx_purchases_seller_created_at_price ON purchases;
DROP INDEX idx_items_seller_status_created_at ON items;
DROP INDEX idx_likes_item_user ON likes;
DROP INDEX idx_images_item_sort_url ON item_images;
DROP INDEX idx_reviews_ee_rating ON user_reviews;
