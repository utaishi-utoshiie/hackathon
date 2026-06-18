export interface User {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  avatarUrl: string;
}

export interface Item {
  id: number;
  sellerId: number;
  sellerName: string;
  sellerAvatarUrl: string;
  sellerRatingAvg: number;
  sellerRatingCount: number;
  sellerTxCount: number;
  title: string;
  description: string;
  category: string;
  price: number;
  minPrice: number;
  aiPersonality: "standard" | "osaka" | "cool" | "anime";
  barterEnabled: boolean;
  wantCategory: string;
  status: "active" | "sold" | "hidden";
  imageUrl: string;
  likeCount: number;
  createdAt: string;
}

export interface Conversation {
  id: number;
  itemId: number;
  itemTitle: string;
  itemPrice: number;
  itemStatus: "active" | "sold" | "hidden";
  itemImageUrl: string;
  itemCategory: string;
  buyerId: number;
  sellerId: number;
  counterpartId: number;
  counterpartName: string;
  counterpartAvatarUrl: string;
  purchaseId?: number;
  purchaseStatus?: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
}

export interface UserReview {
  id: number;
  purchaseId: number;
  itemId: number;
  itemTitle: string;
  reviewerId: number;
  reviewerName: string;
  revieweeId: number;
  revieweeName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ItemScene {
  id: number;
  userId: number;
  itemId: number;
  imagePath: string;
  imageUrl: string;
  prompt: string;
  videoPath: string;
  videoUrl: string;
}

export type Route =
  | { page: "auth" }
  | { page: "home" }
  | { page: "sell" }
  | { page: "messages" }
  | { page: "mypage" }
  | { page: "item"; itemId: number }
  | { page: "admin"; subpage: "stats" | "moderations" | "users" }
  | { page: "help" };

export type NavPage = "home" | "sell" | "messages" | "mypage" | "help";

export interface NavItem {
  page: NavPage;
  label: string;
  icon: any; // We can use React.ComponentType or any to be safe and easily interchangeable
}

export interface PersonalStats {
  summary: {
    totalSales: number;
    totalRevenue: number;
    activeItems: number;
    totalLikes: number;
  };
  categoryDistribution: { category: string; itemCount: number; totalRevenue: number }[];
  dailyRevenue: { date: string; amount: number }[];
}

export function getPublicUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("gcs://")) {
    return url.replace("gcs://", "https://storage.googleapis.com/");
  }
  return url;
}
