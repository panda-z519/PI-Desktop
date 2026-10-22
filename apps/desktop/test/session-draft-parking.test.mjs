import { readComposerModule, readStoreModule } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const {
  claimParkedDraft,
  createSessionDraftParking,
  parkedDraftHasContent,
  rememberParkedDraft,
} = await import("../src/lib/session-draft-parking.ts");

const sessionSlice = await readStoreModule("slices/session-slice.ts");
const sessionCoordination = await readStoreModule("runtime/session-coordination.ts");
const draftHook = await readComposerModule("hooks/useComposerDraft.ts");

test("only real draft content counts as parked content", () => {
  assert.equal(parkedDraftHasContent(undefined), false);
  assert.equal(parkedDraftHasContent({ text: "", fileReferences: [] }), false);
  assert.equal(parkedDraftHasContent({ text: "   \n", fileReferences: [] }), false);
  assert.equal(parkedDraftHasContent({ text: "hello", fileReferences: [] }), true);
  assert.equal(
    parkedDraftHasContent({
      text: "",
      fileReferences: [{ path: "a.ts", name: "a.ts" }],
    }),
    true,
  );
});

test("a parked chat is remembered once and claimed by the New Task that opens it", () => {
  const empty = createSessionDraftParking();
  assert.deepEqual(empty.pending, []);

  const parked = rememberParkedDraft(empty, "session-a");
  assert.deepEqual(parked.pending, ["session-a"]);
  assert.equal(parked.parked, "session-a");
  // Remembering the same chat twice must not duplicate it.
  assert.equal(rememberParkedDraft(parked, "session-a"), parked);

  const second = rememberParkedDraft(parked, "session-b");
  assert.deepEqual(second.pending, ["session-a", "session-b"]);
  assert.equal(second.parked, "session-b");

  const claimed = claimParkedDraft(second, "session-b", null);
  assert.deepEqual(claimed.pending, ["session-a"]);
  assert.equal(claimed.parked, null, "a claimed chat cannot be re-claimed");
});

test("New Task hands the leaving chat's content over before reusing an empty slot", () => {
  const newSession =
    sessionSlice.match(/newSession: async[\s\S]*?\n    forkSession: async/)?.[0] ?? "";
  assert.ok(newSession.length > 0, "newSession implementation not found");
  assert.ok(
    newSession.indexOf("parkComposerDraftForNewTask") <
      newSession.indexOf('await get().selectSession(destination'),
    "the leaving chat's content must move before the destination is selected",
  );
  assert.match(newSession, /parkedDraft: runtime\.parkedDraftForNewSession\(state\)/);
});

test("a created session receives the parked draft of the chat it replaces", () => {
  const persist =
    sessionCoordination.match(
      /async function persistSessionAndSelect[\s\S]*?\n  }\n\n  async function materializeDraftSession/,
    )?.[0] ?? "";
  assert.ok(persist.length > 0, "persistSessionAndSelect not found");
  assert.match(persist, /options\.parkedDraft/);
  assert.ok(
    persist.indexOf("runtime.handOverComposerDraftForCreatedSession") >
      persist.indexOf("await api.createSession"),
    "the handover needs the created session id",
  );
});

test("the composer reports its unsent content and never rewrites a moved draft", () => {
  assert.match(draftHook, /reportComposerDraft/);
  assert.match(draftHook, /sameDraftContent\(projected, leaving\)/);
  assert.ok(
    draftHook.indexOf("sameDraftContent(projected, leaving)") <
      draftHook.indexOf("persistDraft(previousKey)"),
    "the guard must run before the outgoing slot is written",
  );
});
