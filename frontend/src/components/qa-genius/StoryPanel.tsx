import { CheckCircle2, BookOpen, ChevronRight } from "lucide-react";
import { UserStory } from "../../types";

interface Props {
  userStories: UserStory[];
  activeStoryId?: string;
  onSelect?: (id: string) => void;
}

export default function StoryPanel({ userStories, activeStoryId, onSelect }: Props) {
  if (userStories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500">
        <BookOpen className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">User stories will appear here after parsing a PRD</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-3">
      {userStories.map((story) => {
        const isActive = story.id === activeStoryId;
        return (
          <button
            key={story.id}
            onClick={() => onSelect?.(story.id)}
            className={`w-full text-left rounded-lg border p-4 transition-all ${
              isActive
                ? "border-sky-500/50 bg-sky-500/10"
                : "border-surface-600 bg-surface-800 hover:border-surface-500 hover:bg-surface-700/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium leading-snug ${isActive ? "text-sky-300" : "text-slate-200"}`}>
                {story.title}
              </p>
              <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isActive ? "text-sky-400" : "text-slate-500"}`} />
            </div>

            {story.steps.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {story.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-slate-600 mt-0.5">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            )}

            {story.acceptanceCriteria.length > 0 && (
              <div className="mt-2.5 space-y-1">
                {story.acceptanceCriteria.map((ac, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-emerald-400/70">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{ac}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
