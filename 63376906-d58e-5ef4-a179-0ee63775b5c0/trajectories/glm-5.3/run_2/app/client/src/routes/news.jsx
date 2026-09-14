import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty, Words } from "../api.jsx";

const tagWords = { funding: "funding", partnership: "partnership", technical: "technical", recognition: "recognition" };

export default function News() {
  const news = useApi("/news");
  return (
    <div>
      <DocMeta
        title="News — Ravel"
        description="One event listed once with its coverage, its outlet, its date and its language."
      />
      <section class="container">
        <p class="eyebrow">News</p>
        <Reveal as="h1">What we have announced</Reveal>
        <p class="body-big">
          One event appears once, with its coverage. An item in another language says so
          before you click.
        </p>
      </section>

      <section class="container section">
        {news.loading ? <Loading /> : news.data?.length ? (
          <ul class="stack" style="list-style:none;padding:0">
            {news.data.map((n) => (
              <li class="card" key={n.id}>
                <p class="eyebrow" style="margin:0 0 0.3rem">{tagWords[n.tag] || n.tag}</p>
                <h3 style="margin:0">{n.title}</h3>
                <p class="body-regular" style="margin-bottom:0">
                  {n.outlet} · <span class="mono ref">{n.published_on}</span>
                  {n.language !== "en" && <> · written in {n.language === "fr" ? "French" : n.language}</>}
                  {" · "}
                  <a href={n.link} rel="noopener">coverage<span class="sr-only"> of {n.title}</span></a>
                </p>
              </li>
            ))}
          </ul>
        ) : <Empty>There are no news items yet.</Empty>}
        <p class="body-small">
          Tags are a real taxonomy: <Words>funding</Words> <Words>partnership</Words>{" "}
          <Words>technical</Words> <Words>recognition</Words>.
        </p>
      </section>
    </div>
  );
}
