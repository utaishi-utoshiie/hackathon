# DB Design

## Tables

### users

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| name | VARCHAR(80) | Display name |
| email | VARCHAR(255) | Unique |
| password_hash | VARCHAR(255) | Password hash |
| role | VARCHAR(30) | user/admin |
| created_at | DATETIME | Created time |
| updated_at | DATETIME | Updated time |

### items

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| seller_id | BIGINT | FK users.id |
| title | VARCHAR(120) | Item title |
| description | TEXT | Item description |
| category | VARCHAR(80) | Category |
| price | INT | JPY |
| status | VARCHAR(30) | active/sold/hidden |
| created_at | DATETIME | Created time |
| updated_at | DATETIME | Updated time |

### item_images

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| item_id | BIGINT | FK items.id |
| image_url | TEXT | CDN or object storage URL |
| sort_order | INT | Display order |

### likes

| Column | Type | Note |
| --- | --- | --- |
| user_id | BIGINT | FK users.id |
| item_id | BIGINT | FK items.id |
| created_at | DATETIME | Created time |

### purchases

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| item_id | BIGINT | FK items.id |
| buyer_id | BIGINT | FK users.id |
| seller_id | BIGINT | FK users.id |
| price | INT | Purchase price |
| status | VARCHAR(30) | completed/canceled |
| created_at | DATETIME | Created time |

### conversations

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| item_id | BIGINT | FK items.id |
| buyer_id | BIGINT | FK users.id |
| seller_id | BIGINT | FK users.id |
| created_at | DATETIME | Created time |
| updated_at | DATETIME | Updated time |

### messages

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| conversation_id | BIGINT | FK conversations.id |
| sender_id | BIGINT | FK users.id |
| body | TEXT | Message body |
| created_at | DATETIME | Created time |

### ai_generations

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| user_id | BIGINT | FK users.id |
| item_id | BIGINT | Nullable FK items.id |
| kind | VARCHAR(40) | description/question/moderation |
| prompt | TEXT | Prompt sent to OpenAI |
| result | TEXT | OpenAI response |
| created_at | DATETIME | Created time |

### item_moderations

| Column | Type | Note |
| --- | --- | --- |
| id | BIGINT | Primary key |
| item_id | BIGINT | FK items.id |
| user_id | BIGINT | FK users.id |
| prohibited | BOOLEAN | Whether listing was considered prohibited |
| risk_level | VARCHAR(20) | low/medium/high |
| reasons | TEXT | Review reasons |
| blocked_keywords | TEXT | Detected risky terms |
| created_at | DATETIME | Created time |

## Indexes

- `users.email` unique index
- `items.seller_id`
- `items.status, created_at`
- `likes.item_id`
- `likes.user_id, item_id` unique index
- `purchases.item_id`
- `conversations.buyer_id`
- `conversations.seller_id`
- `messages.conversation_id, created_at`
- `ai_generations.user_id, created_at`
- `item_moderations.item_id, created_at`
- `item_moderations.user_id, created_at`
- `item_moderations.risk_level`
