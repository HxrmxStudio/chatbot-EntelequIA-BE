import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { FeedbackCategory, FeedbackRating } from '../application/ports/chat-feedback.port';

const FEEDBACK_RATINGS: FeedbackRating[] = ['up', 'down'];
const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'accuracy',
  'relevance',
  'tone',
  'ux',
  'other',
];

export class ChatFeedbackRequestDto {
  @IsString()
  @IsIn(['web'])
  source!: 'web';

  @IsString()
  @MaxLength(255)
  conversationId!: string;

  @IsUUID()
  responseId!: string;

  @IsString()
  @IsIn(FEEDBACK_RATINGS)
  rating!: FeedbackRating;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;

  @IsOptional()
  @IsString()
  @IsIn(FEEDBACK_CATEGORIES)
  category?: FeedbackCategory;
}
