package main

import (
	"context"
	"database/sql"
)

type demoCatalogItem struct {
	Title, Description, Category, ImageURL string
	Price, MinPrice                        int
}

var demoCatalog = []demoCatalogItem{
	{"オーバーサイズ デニムジャケット", "程よく色落ちしたブルーのデニムジャケット。ユニセックスM相当、目立つ傷はありません。", "衣服・ファッション", "https://images.unsplash.com/photo-1523205771623-e0faa4d2813d?auto=format&fit=crop&w=900&q=82", 6800, 5500},
	{"ヴィンテージ レザージャケット ブラック", "柔らかい本革のダブルライダース。袖口にわずかな使用感があります。", "衣服・ファッション", "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=82", 15800, 13000},
	{"ウールチェスターコート キャメル", "上品なキャメルカラーのロングコート。クリーニング済みです。", "衣服・ファッション", "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?auto=format&fit=crop&w=900&q=82", 9200, 7600},
	{"ミリタリー MA-1 フライトジャケット", "軽くて暖かい定番MA-1。カーキ、Lサイズ。", "衣服・ファッション", "https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=82", 6200, 5000},
	{"コットン白シャツ リラックスフィット", "ハリのあるコットン素材。2回着用したのみの美品です。", "衣服・ファッション", "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=82", 3200, 2500},
	{"リネンシャツ ナチュラルベージュ", "通気性の良いリネン100%。春夏の羽織りにもおすすめです。", "衣服・ファッション", "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=82", 3900, 3000},
	{"ボーダー長袖カットソー", "厚手のバスク生地。ネイビー×ホワイト、Mサイズです。", "衣服・ファッション", "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=82", 2800, 2200},
	{"カシミヤ混 クルーネックニット", "肌触りの良いグレーのニット。毛玉の少ない良好な状態です。", "衣服・ファッション", "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=82", 5400, 4300},
	{"ケーブル編みニット アイボリー", "立体的な編み柄の暖かなセーター。ゆったりしたシルエットです。", "衣服・ファッション", "https://images.unsplash.com/photo-1608234807905-4466023792f5?auto=format&fit=crop&w=900&q=82", 4800, 3800},
	{"スウェットパーカー 杢グレー", "裏毛素材のベーシックパーカー。普段使いしやすい一着です。", "衣服・ファッション", "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=82", 4200, 3300},
	{"ワイドストレート デニムパンツ", "濃紺のワイドデニム。裾上げなし、ウエスト78cmです。", "衣服・ファッション", "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=82", 5900, 4700},
	{"ブラック テーパードスラックス", "センタープレス入り。仕事にも休日にも使えるきれいめパンツです。", "衣服・ファッション", "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=82", 4500, 3500},
	{"プリーツロングスカート", "落ち感のあるくすみブルー。ウエストゴムで履きやすいです。", "衣服・ファッション", "https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=900&q=82", 4100, 3200},
	{"小花柄 ロングワンピース", "軽やかな素材の花柄ワンピース。春から秋まで着用できます。", "衣服・ファッション", "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=82", 6500, 5200},
	{"リトルブラックドレス", "シンプルな膝丈ドレス。結婚式で一度着用しました。", "衣服・ファッション", "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=82", 7800, 6200},
	{"コットン テーラードジャケット", "軽量で肩の凝らないネイビージャケット。Mサイズです。", "衣服・ファッション", "https://images.unsplash.com/photo-1598808503746-f34c53b9323e?auto=format&fit=crop&w=900&q=82", 7300, 5800},
	{"トレンチコート ライトベージュ", "春秋に便利な定番トレンチ。ベルト付き、クリーニング済みです。", "衣服・ファッション", "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=82", 10800, 8800},
	{"ダウンベスト ブラック", "薄手で重ね着しやすいダウンベスト。収納袋付きです。", "衣服・ファッション", "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=82", 5200, 4100},
	{"ランニングジャケット 撥水モデル", "夜間の視認性を高める反射材付き。軽い雨にも対応します。", "衣服・ファッション", "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=900&q=82", 4600, 3600},
	{"セットアップスーツ チャコール", "細身の2ボタンスーツ。ジャケットとパンツのセットです。", "衣服・ファッション", "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=82", 12800, 10500},
	{"キャンバス ローカットスニーカー", "生成りのシンプルなスニーカー。26.5cm、着用3回です。", "靴・バッグ", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82", 4800, 3800},
	{"レザー ローファー ブラウン", "本革のコインローファー。25.5cm、ソールの減りはわずかです。", "靴・バッグ", "https://images.unsplash.com/photo-1614252369475-531eba835eb1?auto=format&fit=crop&w=900&q=82", 7200, 5800},
	{"サイドゴアブーツ ブラック", "ミニマルな本革ブーツ。26cm、箱付きです。", "靴・バッグ", "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=900&q=82", 8900, 7200},
	{"トレイルランニングシューズ", "グリップ力の高いアウトソール。27cm、低山で2回使用しました。", "靴・バッグ", "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?auto=format&fit=crop&w=900&q=82", 6300, 5000},
	{"レザー トートバッグ", "A4とノートPCが入るブラウンの本革トート。内ポケット付きです。", "靴・バッグ", "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=82", 9800, 7900},
	{"ミニショルダーバッグ ブラック", "スマホと財布が収まるコンパクトサイズ。ストラップ調整可能です。", "靴・バッグ", "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=900&q=82", 5600, 4400},
	{"ナイロン バックパック 20L", "軽量で通勤にも旅行にも便利。PCスリーブを備えています。", "靴・バッグ", "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=900&q=82", 6400, 5100},
	{"レザー カードケース", "薄型の本革カードケース。使用期間1か月の美品です。", "靴・バッグ", "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=82", 2900, 2200},
	{"クラシック腕時計 シルバー", "白文字盤とステンレスベルトのシンプルなクォーツ時計です。", "アクセサリー", "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=900&q=82", 11800, 9500},
	{"ミニマル腕時計 レザーベルト", "黒文字盤にブラウンレザーの落ち着いたデザイン。電池交換済みです。", "アクセサリー", "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=82", 8400, 6800},
	{"シルバー チェーンネックレス", "細身で合わせやすい925シルバー。専用ポーチ付きです。", "アクセサリー", "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=82", 3900, 3000},
	{"フープピアス ゴールドカラー", "小ぶりで日常使いしやすいフープピアス。未使用品です。", "アクセサリー", "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=82", 2600, 2000},
	{"偏光サングラス ブラック", "UVカットの偏光レンズ。ケースとクロスが付属します。", "アクセサリー", "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=82", 4300, 3400},
	{"ワイヤレス ヘッドホン", "ノイズキャンセリング対応。約20時間再生、ケース付きです。", "家電・スマホ", "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=82", 9800, 8000},
	{"完全ワイヤレスイヤホン", "USB-C充電対応。イヤーピースと充電ケース一式を付属します。", "家電・スマホ", "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=900&q=82", 6800, 5400},
	{"コンパクト ミラーレスカメラ", "旅行用に使っていた軽量カメラ。標準ズームレンズ付きです。", "家電・スマホ", "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=82", 42800, 38000},
	{"メカニカルキーボード 75%", "茶軸のコンパクトキーボード。Bluetoothと有線接続に対応します。", "家電・スマホ", "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=82", 7600, 6200},
	{"ポータブル Bluetoothスピーカー", "防滴仕様でアウトドアにも便利。充電ケーブル付きです。", "家電・スマホ", "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=82", 5900, 4700},
	{"スマートウォッチ GPSモデル", "運動記録と通知確認に対応。替えバンドを2本付属します。", "家電・スマホ", "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=900&q=82", 13800, 11500},
	{"レコードプレーヤー 木目調", "内蔵スピーカー付き。33/45回転対応で動作確認済みです。", "家電・スマホ", "https://images.unsplash.com/photo-1461360228754-6e81c478b882?auto=format&fit=crop&w=900&q=82", 11200, 9000},
	{"ハードカバー写真集 3冊セット", "建築・旅・自然をテーマにした大型写真集のセットです。", "本・ゲーム・エンタメ", "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=900&q=82", 3800, 2900},
	{"名作小説 文庫本 12冊セット", "国内外の名作をまとめた読書セット。書き込みはありません。", "本・ゲーム・エンタメ", "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=82", 3200, 2400},
	{"ボードゲーム ファミリーセット", "2〜6人で遊べるボードゲーム3点。欠品なし、説明書付きです。", "本・ゲーム・エンタメ", "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=900&q=82", 4500, 3500},
	{"木製チェスセット", "折りたたみ盤に駒を収納できるクラシックなチェスセットです。", "本・ゲーム・エンタメ", "https://images.unsplash.com/photo-1586165368502-1bad197a6461?auto=format&fit=crop&w=900&q=82", 5200, 4100},
	{"北欧デザイン テーブルランプ", "暖色LED電球付き。ベッドサイドにも合うコンパクトな照明です。", "インテリア・住まい", "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=82", 6200, 5000},
	{"陶器フラワーベース 2個セット", "マットな白とベージュの花瓶セット。欠けやひびはありません。", "インテリア・住まい", "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=82", 3600, 2800},
	{"ウールブランケット グレー", "ソファやベッドで使える大判サイズ。ホームクリーニング済みです。", "インテリア・住まい", "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=900&q=82", 4800, 3800},
	{"ヨガマット 6mm", "滑りにくい天然ゴム素材。収納ストラップ付きです。", "スポーツ・アウトドア", "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?auto=format&fit=crop&w=900&q=82", 3500, 2700},
	{"キャンプ用 LEDランタン", "調光・USB充電対応。キャンプで2回使用しただけです。", "スポーツ・アウトドア", "https://images.unsplash.com/photo-1504851149312-7a075b496cc7?auto=format&fit=crop&w=900&q=82", 4200, 3300},
	{"スケートボード コンプリート", "扱いやすい8インチデッキ。ベアリング交換済みです。", "スポーツ・アウトドア", "https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?auto=format&fit=crop&w=900&q=82", 6900, 5500},
}

func seedDemoCatalog(ctx context.Context, tx *sql.Tx) error {
	if err := seedCatalogItems(ctx, tx, demoCatalog, 10001); err != nil {
		return err
	}
	return seedCatalogItems(ctx, tx, demoMensCatalog, 10051)
}

func seedCatalogItems(ctx context.Context, tx *sql.Tx, catalog []demoCatalogItem, firstID int) error {
	for index, product := range catalog {
		id := firstID + index
		sellerID := 9992
		if index%2 == 1 {
			sellerID = 9993
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO items (id, seller_id, title, description, category, price, min_price, ai_personality, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 'active')`,
			id, sellerID, product.Title, product.Description, catalogCategory(product.Category), product.Price, product.MinPrice)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			"INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, ?, 0)", id, product.ImageURL); err != nil {
			return err
		}
	}
	return nil
}

func catalogCategory(category string) string {
	switch category {
	case "靴・バッグ", "アクセサリー":
		return "衣服・ファッション"
	case "スポーツ・アウトドア":
		return "スポーツ・レジャー"
	case "インテリア・住まい":
		return "その他"
	default:
		return category
	}
}
