import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "@/components/classroom/PageShell";
import {
  claimKnowledgeAdmin,
  deleteKnowledgeChunk,
  importKnowledge,
  knowledgeOverview,
  listIngestionJobs,
  listKnowledgeChunks,
  myKnowledgeRole,
  rebuildEmbeddings,
  seedKnowledgeBase,
  updateKnowledgeChunk,
} from "@/lib/knowledge.functions";

export const Route = createFileRoute("/_authenticated/knowledge")({
  component: KnowledgePage,
  head: () => ({
    meta: [
      { title: "Knowledge base · Voice Bingo" },
      {
        name: "description",
        content:
          "Add textbooks, notes and lecture transcripts, review every lesson the tutor uses, and keep answers grounded in real study material.",
      },
      { property: "og:title", content: "Knowledge base · Voice Bingo" },
      {
        property: "og:description",
        content: "Manage the study material behind Voice Bingo's voice tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const field =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-cream outline-none focus-visible:ring-2 focus-visible:ring-amber/60";
const card = "rounded-xl border border-line bg-surface/60 p-5";
const button =
  "rounded-md bg-amber px-3.5 py-2 text-xs font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50";
const ghost =
  "rounded-md border border-line px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-cream disabled:opacity-50";

function KnowledgePage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(knowledgeOverview);
  const fetchRole = useServerFn(myKnowledgeRole);
  const fetchJobs = useServerFn(listIngestionJobs);
  const fetchChunks = useServerFn(listKnowledgeChunks);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [notice, setNotice] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ["knowledge", "overview"], queryFn: () => fetchOverview() });
  const role = useQuery({ queryKey: ["knowledge", "role"], queryFn: () => fetchRole() });
  const isEditor = role.data?.editor ?? false;

  const jobs = useQuery({
    queryKey: ["knowledge", "jobs"],
    queryFn: () => fetchJobs(),
    enabled: isEditor,
    refetchInterval: 8000,
  });

  const chunks = useQuery({
    queryKey: ["knowledge", "chunks", search, status],
    queryFn: () => fetchChunks({ data: { search, status, subject: "", limit: 25 } }),
    enabled: isEditor,
  });

  function refreshAll(message: string) {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
  }

  const claim = useMutation({
    mutationFn: useServerFn(claimKnowledgeAdmin),
    onSuccess: (result: { granted: boolean; reason: string | null }) =>
      refreshAll(result.granted ? "You are now the knowledge administrator." : (result.reason ?? "")),
  });

  const seed = useMutation({
    mutationFn: useServerFn(seedKnowledgeBase),
    onSuccess: (r: { inserted: number; skipped: number }) => refreshAll(`Starter lessons loaded: ${r.inserted} added, ${r.skipped} already there.`),
    onError: (e: Error) => setNotice(e.message),
  });

  const embed = useMutation({
    mutationFn: useServerFn(rebuildEmbeddings),
    onSuccess: (r: { processed: number; failed: number; remaining: number }) =>
      refreshAll(`Meaning search prepared for  lessons;  still waiting.`),
    onError: (e: Error) => setNotice(e.message),
  });

  const runImport = useMutation({
    mutationFn: useServerFn(importKnowledge),
    onSuccess: (r: { chunks_created: number; duplicates_skipped: number }) =>
      refreshAll(
        `Import finished:  lessons added,  duplicates skipped.`,
      ),
    onError: (e: Error) => setNotice(e.message),
  });

  const updateChunk = useMutation({
    mutationFn: useServerFn(updateKnowledgeChunk),
    onSuccess: () => refreshAll("Lesson updated."),
    onError: (e: Error) => setNotice(e.message),
  });

  const removeChunk = useMutation({
    mutationFn: useServerFn(deleteKnowledgeChunk),
    onSuccess: () => refreshAll("Lesson removed."),
    onError: (e: Error) => setNotice(e.message),
  });

  function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const exams = value("exams")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    runImport.mutate({
      data: {
        sourceName: value("sourceName"),
        sourceType: value("sourceType") as "textbook",
        ...(value("url") ? { url: value("url") } : {}),
        ...(value("title") ? { title: value("title") } : {}),
        ...(value("rawText") ? { rawText: value("rawText") } : {}),
        ...(value("subject") ? { subject: value("subject") } : {}),
        ...(value("class_level") ? { class_level: value("class_level") } : {}),
        ...(value("chapter") ? { chapter: value("chapter") } : {}),
        exams,
      },
    });
  }

  return (
    <PageShell
      eyebrow="Knowledge base"
      title="The material behind every answer"
      intro="Add textbooks, notes and lecture transcripts, then review each lesson the tutor can teach from. Everything here is searchable by meaning, not just by keyword."
    >
      {notice && (
        <p className="mb-6 rounded-md border border-line bg-surface/60 px-4 py-3 text-sm text-cream">
          {notice}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Lessons" value={overview.data?.chunks ?? 0} />
        <Stat label="Documents" value={overview.data?.documents ?? 0} />
        <Stat label="Sources" value={overview.data?.sources ?? 0} />
      </section>

      {!isEditor && (
        <div className={`${card} mt-8`}>
          <h2 className="font-display text-lg font-semibold">You don't have editing access yet</h2>
          <p className="mt-2 text-sm text-muted">
            If you are the first person setting this up, claim the administrator seat. Otherwise ask an
            existing administrator to add you.
          </p>
          <button
            type="button"
            className={`${button} mt-4`}
            disabled={claim.isPending}
            onClick={() => claim.mutate({})}
          >
            {claim.isPending ? "Checking…" : "Claim administrator"}
          </button>
        </div>
      )}

      {isEditor && (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className={button}
              disabled={seed.isPending}
              onClick={() => seed.mutate({})}
            >
              {seed.isPending ? "Loading starter lessons…" : "Load starter lessons"}
            </button>
            <button
              type="button"
              className={ghost}
              disabled={embed.isPending}
              onClick={() => embed.mutate({ data: { limit: 64 } })}
            >
              {embed.isPending ? "Preparing meaning search…" : "Prepare meaning search"}
            </button>
          </div>

          <section className={`${card} mt-8`}>
            <h2 className="font-display text-lg font-semibold">Add material</h2>
            <p className="mt-1 text-sm text-muted">
              Paste a link or the text itself. It is split into lessons, tagged with subject and chapter,
              and checked for duplicates.
            </p>
            <form onSubmit={submitImport} className="mt-5 grid gap-4 md:grid-cols-2">
              <Field name="sourceName" label="Source name" required placeholder="NCERT Physics Class 12" />
              <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Kind of material
                <select name="sourceType" defaultValue="web" className={field}>
                  <option value="textbook">Textbook</option>
                  <option value="notes">Notes</option>
                  <option value="lecture_transcript">Lecture transcript</option>
                  <option value="question_bank">Question bank</option>
                  <option value="web">Web page</option>
                </select>
              </label>
              <Field name="url" label="Link (optional)" placeholder="https://…" />
              <Field name="title" label="Title (optional)" placeholder="Electrostatics" />
              <Field name="subject" label="Subject" placeholder="Physics" />
              <Field name="class_level" label="Class" placeholder="Class 12" />
              <Field name="chapter" label="Chapter" placeholder="Electric Potential" />
              <Field name="exams" label="Exams (comma separated)" placeholder="JEE, NEET" />
              <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted md:col-span-2">
                Or paste the material
                <textarea name="rawText" rows={6} className={field} placeholder="Paste notes or a transcript…" />
              </label>
              <div className="md:col-span-2">
                <button type="submit" className={button} disabled={runImport.isPending}>
                  {runImport.isPending ? "Importing…" : "Import material"}
                </button>
              </div>
            </form>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">Recent imports</h2>
            <div className="mt-4 grid gap-2">
              {(jobs.data ?? []).length === 0 && (
                <p className="text-sm text-muted">Nothing imported yet.</p>
              )}
              {(jobs.data ?? []).map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface/40 px-4 py-3 text-sm"
                >
                  <span className="text-cream">{job.input_title || job.input_url || job.job_type}</span>
                  <span className="text-xs text-muted">
                    {job.status} · {job.chunks_created} lessons · {job.duplicates_skipped} duplicates
                    {job.error ? ` · ${job.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="font-display text-lg font-semibold">Review lessons</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the text…"
                className={`${field} max-w-xs`}
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className={`${field} max-w-[10rem]`}
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3">
              {(chunks.data ?? []).length === 0 && (
                <p className="text-sm text-muted">No lessons match this filter.</p>
              )}
              {(chunks.data ?? []).map((chunk) => (
                <article key={chunk.id} className={card}>
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-cream">
                        {chunk.title || chunk.topic || "Untitled lesson"}
                      </h3>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-muted">
                        {[chunk.subject, chunk.class_level, chunk.chapter].filter(Boolean).join(" · ") ||
                          "Untagged"}
                        {" · "}
                        {chunk.approval_status}
                        {chunk.embedding_version ? " · meaning search ready" : " · keyword only"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {chunk.approval_status !== "approved" && (
                        <button
                          type="button"
                          className={ghost}
                          onClick={() =>
                            updateChunk.mutate({ data: { id: chunk.id, approval_status: "approved" } })
                          }
                        >
                          Approve
                        </button>
                      )}
                      {chunk.approval_status !== "rejected" && (
                        <button
                          type="button"
                          className={ghost}
                          onClick={() =>
                            updateChunk.mutate({ data: { id: chunk.id, approval_status: "rejected" } })
                          }
                        >
                          Reject
                        </button>
                      )}
                      <button
                        type="button"
                        className={ghost}
                        onClick={() => removeChunk.mutate({ data: { id: chunk.id } })}
                      >
                        Delete
                      </button>
                    </div>
                  </header>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted">{chunk.content}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-cream">{value}</p>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
      {label}
      <input name={name} required={required} placeholder={placeholder} className={field} />
    </label>
  );
}
