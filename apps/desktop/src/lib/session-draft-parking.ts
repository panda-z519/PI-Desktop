import type { ComposerDraftSnapshot } from "./composer-smart-stop";

/**
 * Unsent composer content New Task carries across its empty-chat visits
 *.
 *
 * New Task reuses the scope's latest empty session, which is also how it
 * navigates away from the empty chat the user is on. Without this, content
 * typed there stays in that row's draft cache: the sidebar row looks empty, and
 * only a later New Task happens to come back to it.
 *
 * Nothing here touches disk or the host. The parking only records which empty
 * chat still holds content, so New Task can hand it to the chat it opens.
 */

export type ParkedDraft = {
  sessionId: string;
  draft: ComposerDraftSnapshot;
};

export type SessionDraftParking = {
  /** Chats whose unsent content New Task has not claimed yet, oldest first. */
  readonly pending: readonly string[];
  /**
   * Chat whose content New Task just moved, as a fallback when nothing in the
   * scope has parked content left.
   */
  parked: string | null;
};

export function createSessionDraftParking(): SessionDraftParking {
  return { pending: [], parked: null };
}

/** Draft content worth carrying across a New Task. */
export function parkedDraftHasContent(
  snapshot: Pick<ComposerDraftSnapshot, "text" | "fileReferences"> | undefined,
): boolean {
  if (!snapshot) return false;
  return snapshot.text.trim().length > 0 || snapshot.fileReferences.length > 0;
}

export function rememberParkedDraft(
  parking: SessionDraftParking,
  sessionId: string | null,
): SessionDraftParking {
  if (!sessionId || parking.pending.includes(sessionId)) return parking;
  return { ...parking, pending: [...parking.pending, sessionId], parked: sessionId };
}

/**
 * A New Task opened a chat: its content is claimed, and a chat that was left
 * behind keeps its own parking.
 */
export function claimParkedDraft(
  parking: SessionDraftParking,
  sessionId: string,
  parked: string | null,
): SessionDraftParking {
  return {
    pending: parking.pending.filter((held) => held !== sessionId),
    parked,
  };
}
