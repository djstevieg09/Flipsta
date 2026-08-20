import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from "./constants.js";

/** Section 12.4 — Reviews & Seller Ratings. */
export function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= REVIEW_RATING_MIN && rating <= REVIEW_RATING_MAX;
}

export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((total, r) => total + r, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}
