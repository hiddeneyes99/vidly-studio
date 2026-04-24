import { useMutation } from "@tanstack/react-query";
import {
  generateContent,
  generateVideoIdeas,
  generateScript,
  generateScriptHooks,
  regenerateScriptSection,
  polishScript,
  refineScript,
  generateTitles,
  generateTitlesV2,
  generateDescription,
  generateDescriptionV2,
  generateWeeklyPlan,
  generateWeeklyPlanV2,
  chatWithMemory,
  generateConversationTitle,
  generateAudiencePersona,
  predictVideoPerformance,
  generateThumbnail,
  generateThumbnailStrategy,
  scoreThumbnails,
  generateCommentReplies,
  generateGoalSuggestions,
  generateBestUploadTimes,
  suggestCrossPostDelays,
  type GenerateThumbnailBody,
  type GenerateThumbnailStrategyBody,
  type ScoreThumbnailsBody,
  type GenerateCommentRepliesBody,
  type SuggestGoalsBody,
  type BestUploadTimesBody,
  type CrossPostDelaysBody,
  type GenerateContentBody,
  type GenerateIdeasBody,
  type GenerateScriptBody,
  type GenerateHooksBody,
  type RegenerateSectionBody,
  type PolishScriptBody,
  type RefineScriptBody,
  type GenerateTitlesBody,
  type GenerateTitlesV2Body,
  type GenerateDescriptionBody,
  type GenerateDescriptionV2Body,
  type GenerateWeeklyPlanBody,
  type WeeklyPlanContext,
  type ChatBody,
  type AudiencePersonaBody,
  type PredictPerformanceBody,
} from "./gemini";

type Wrap<TBody> = { data: TBody };

export function useGenerateContent() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateContentBody>) => generateContent(data),
  });
}

export function useGenerateVideoIdeas() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateIdeasBody>) => generateVideoIdeas(data),
  });
}

export function useGenerateScript() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateScriptBody>) => generateScript(data),
  });
}

export function useGenerateScriptHooks() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateHooksBody>) => generateScriptHooks(data),
  });
}

export function useRegenerateScriptSection() {
  return useMutation({
    mutationFn: ({ data }: Wrap<RegenerateSectionBody>) =>
      regenerateScriptSection(data),
  });
}

export function usePolishScript() {
  return useMutation({
    mutationFn: ({ data }: Wrap<PolishScriptBody>) => polishScript(data),
  });
}

export function useRefineScript() {
  return useMutation({
    mutationFn: ({ data }: Wrap<RefineScriptBody>) => refineScript(data),
  });
}

export function useGenerateTitles() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateTitlesBody>) => generateTitles(data),
  });
}

export function useGenerateDescription() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateDescriptionBody>) => generateDescription(data),
  });
}

export function useGenerateWeeklyPlan() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateWeeklyPlanBody>) => generateWeeklyPlan(data),
  });
}

export function useGenerateTitlesV2() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateTitlesV2Body>) => generateTitlesV2(data),
  });
}

export function useGenerateDescriptionV2() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateDescriptionV2Body>) =>
      generateDescriptionV2(data),
  });
}

export function useGenerateWeeklyPlanV2() {
  return useMutation({
    mutationFn: ({ data }: Wrap<WeeklyPlanContext>) => generateWeeklyPlanV2(data),
  });
}

export function useChatWithMemory() {
  return useMutation({
    mutationFn: ({ data }: Wrap<ChatBody>) => chatWithMemory(data),
  });
}

export function useGenerateConversationTitle() {
  return useMutation({
    mutationFn: ({ data }: Wrap<{ message: string }>) =>
      generateConversationTitle(data.message),
  });
}

export function useGenerateAudiencePersona() {
  return useMutation({
    mutationFn: ({ data }: Wrap<AudiencePersonaBody>) => generateAudiencePersona(data),
  });
}

export function usePredictVideoPerformance() {
  return useMutation({
    mutationFn: ({ data }: Wrap<PredictPerformanceBody>) => predictVideoPerformance(data),
  });
}

export function useGenerateThumbnail() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateThumbnailBody>) => generateThumbnail(data),
  });
}

export function useGenerateThumbnailStrategy() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateThumbnailStrategyBody>) =>
      generateThumbnailStrategy(data),
  });
}

export function useScoreThumbnails() {
  return useMutation({
    mutationFn: ({ data }: Wrap<ScoreThumbnailsBody>) => scoreThumbnails(data),
  });
}

export function useGenerateCommentReplies() {
  return useMutation({
    mutationFn: ({ data }: Wrap<GenerateCommentRepliesBody>) =>
      generateCommentReplies(data),
  });
}

export function useGenerateGoalSuggestions() {
  return useMutation({
    mutationFn: ({ data }: Wrap<SuggestGoalsBody>) =>
      generateGoalSuggestions(data),
  });
}

export function useGenerateBestUploadTimes() {
  return useMutation({
    mutationFn: ({ data }: Wrap<BestUploadTimesBody>) =>
      generateBestUploadTimes(data),
  });
}

export function useSuggestCrossPostDelays() {
  return useMutation({
    mutationFn: ({ data }: Wrap<CrossPostDelaysBody>) =>
      suggestCrossPostDelays(data),
  });
}
