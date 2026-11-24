type RedditPost = {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  permalink: string;
};

type RedditComment = {
  id: string;
  author: string;
  body: string;
  score: number;
};

function truncateComment(text: string): string {
  if (text.length <= 150) return text;
  return `${text.slice(0, 150)}...`;
}

/**
 * Shows the Reddit results the server stored with the report. Reddit blocks direct
 * browser requests (CORS), so nothing is fetched client-side; the server-side check
 * keeps only clear scam reports.
 */
export function RedditSection({
  posts,
  comments,
  available,
}: {
  posts: RedditPost[];
  comments: Record<string, RedditComment[]>;
  /** False when the server-side Reddit check was unavailable for this report. */
  available: boolean;
}) {
  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-semibold">Community reports found</h2>

      {posts.length === 0 ? (
        <p className="text-sm text-slate-600">
          {available
            ? "No clear scam reports about this company were found on Reddit."
            : "Reddit search was unavailable for this report, so community reports weren't checked."}
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const topComments = [...(comments[post.id] ?? [])].sort((a, b) => b.score - a.score).slice(0, 2);
            return (
              <article key={post.id} className="rounded-lg border border-slate-200 p-4">
                <a
                  href={`https://www.reddit.com${post.permalink}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  {post.title}
                </a>
                <p className="mt-1 text-xs text-slate-600">
                  r/{post.subreddit} | Upvotes: {post.score}
                </p>

                {topComments.length > 0 && (
                  <div className="mt-3 space-y-2 rounded bg-slate-50 p-3">
                    <p className="label" style={{ color: "var(--muted)" }}>
                      Top community responses:
                    </p>
                    {topComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded border p-2"
                        style={{ borderColor: "var(--card-border)", background: "#fff" }}
                      >
                        <p className="text-xs">{truncateComment(comment.body)}</p>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                          u/{comment.author} | Upvotes: {comment.score}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
