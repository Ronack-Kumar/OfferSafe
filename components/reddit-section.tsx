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
    <section aria-labelledby="reddit-title">
      <h2 id="reddit-title" className="sub-title">
        Community reports
      </h2>

      {posts.length === 0 ? (
        <p className="text-[var(--graphite)]">
          {available
            ? "No clear scam reports about this company were found on Reddit."
            : "Reddit search was unavailable for this report, so community reports weren't checked."}
        </p>
      ) : (
        <div className="grid gap-3">
          {posts.map((post) => {
            const topComments = [...(comments[post.id] ?? [])].sort((a, b) => b.score - a.score).slice(0, 2);
            return (
              <article key={post.id} className="rcheck">
                <a
                  href={`https://www.reddit.com${post.permalink}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]"
                >
                  {post.title}
                </a>
                <p className="hint mt-1">
                  r/{post.subreddit} · {post.score} upvotes
                </p>

                {topComments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold">Top replies</p>
                    {topComments.map((comment) => (
                      <blockquote key={comment.id} className="doc m-0 border-l-[3px] border-[var(--hl)] pl-3 text-[14px]">
                        <p className="m-0">{truncateComment(comment.body)}</p>
                        <p className="hint mt-1 font-[family-name:var(--font-ui)]">
                          u/{comment.author} · {comment.score} upvotes
                        </p>
                      </blockquote>
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
