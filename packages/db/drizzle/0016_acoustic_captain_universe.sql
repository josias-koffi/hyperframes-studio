ALTER TYPE "public"."ai_model_kind" ADD VALUE 'image';--> statement-breakpoint
ALTER TYPE "public"."ai_model_kind" ADD VALUE 'video';--> statement-breakpoint
ALTER TYPE "public"."creation_type" ADD VALUE 'realistic';--> statement-breakpoint
ALTER TYPE "public"."generation_step" ADD VALUE 'keyframes' BEFORE 'media';--> statement-breakpoint
ALTER TYPE "public"."generation_step" ADD VALUE 'shots' BEFORE 'media';