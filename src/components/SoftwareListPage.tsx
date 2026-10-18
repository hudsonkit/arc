import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import ArcMark from './ArcMark'
import { useMeta } from '../hooks/useMeta'
import { SITE_URL } from '../utils/site'
import data from '../content/diagramSoftware.json'
import '../agent-share.css'
import '../software-list.css'

interface Tool {
  name: string
  url: string
  category: string
  kind: string
  input: string
  agentReady: string
  license: string
  blurb: string
  bestFor: string
  ours?: boolean
}

const tools = data.tools as Tool[]
const categories = data.categories
const faqs = data.faqs

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/${data.slug}`,
      name: data.metaTitle,
      description: data.metaDescription,
    },
    {
      '@type': 'ItemList',
      name: data.title,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      numberOfItems: tools.length,
      itemListElement: tools.map((tool, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'SoftwareApplication',
          name: tool.name,
          url: tool.url,
          description: tool.blurb,
          applicationCategory: 'DeveloperApplication',
        },
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ],
}

export default function SoftwareListPage() {
  useMeta({
    title: data.metaTitle,
    description: data.metaDescription,
    image: '/og-software.png',
    url: `/${data.slug}`,
  })

  return (
    <div className="asp-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="asp-grid" aria-hidden="true" />
      <div className="asp-shell">
        <header className="asp-header">
          <Link className="asp-brand" to="/" aria-label="Arc home">
            <ArcMark className="asp-mark" />
            <span>
              <strong>Arc</strong>
              <small>diagrams as code</small>
            </span>
          </Link>
          <nav className="asp-nav" aria-label="Agent pages">
            <Link to="/mcp">MCP</Link>
            <Link to="/skills">Skills</Link>
            <Link className="is-active" to={`/${data.slug}`}>Software</Link>
            <Link to="/docs">Docs</Link>
            <a href="https://github.com/hudsonkit/arc" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </header>

        <main>
          <section className="asp-hero dsl-hero">
            <div className="asp-hero-copy">
              <div className="asp-eyebrow">{data.eyebrow}</div>
              <h1>{data.title}.</h1>
              <p>{data.lead}</p>
              <div className="asp-signal-row">
                <span>{tools.length} TOOLS COMPARED</span>
                <span>4 CATEGORIES</span>
                <span>AGENT-READY RATED</span>
              </div>
            </div>
            <aside className="dsl-answer">
              <div className="dsl-answer-tag">
                <Sparkles aria-hidden="true" />
                <span>{data.answer.title}</span>
              </div>
              <p>{data.answer.text}</p>
            </aside>
          </section>

          <section className="dsl-table-wrap" aria-label="Comparison table">
            <table className="dsl-table">
              <thead>
                <tr>
                  <th scope="col">Tool</th>
                  <th scope="col">Type</th>
                  <th scope="col">You author</th>
                  <th scope="col">Agent-ready</th>
                  <th scope="col">License</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.name} className={tool.ours ? 'is-ours' : undefined}>
                    <th scope="row">
                      <a href={tool.url} target="_blank" rel="noreferrer">
                        {tool.name}
                        {tool.ours && <span className="dsl-ours-badge">ours</span>}
                      </a>
                    </th>
                    <td>{tool.kind}</td>
                    <td>{tool.input}</td>
                    <td>{tool.agentReady}</td>
                    <td>{tool.license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {categories.map((category) => {
            const categoryTools = tools.filter((tool) => tool.category === category.id)
            if (categoryTools.length === 0) return null
            return (
              <section className="dsl-category" key={category.id}>
                <div className="asp-section-heading">
                  <div>
                    <div className="asp-tag">// {category.label.toUpperCase()}</div>
                    <h2>{category.label}.</h2>
                  </div>
                  <p>{category.description}</p>
                </div>
                <div className="dsl-cards">
                  {categoryTools.map((tool) => (
                    <article className={`dsl-card${tool.ours ? ' is-ours' : ''}`} key={tool.name}>
                      <div className="dsl-card-head">
                        <h3>
                          {tool.name}
                          {tool.ours && <span className="dsl-ours-badge">ours</span>}
                        </h3>
                        <a
                          aria-label={`Visit ${tool.name}`}
                          className="dsl-card-link"
                          href={tool.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink aria-hidden="true" />
                        </a>
                      </div>
                      <p>{tool.blurb}</p>
                      <dl className="dsl-card-meta">
                        <div><dt>You author</dt><dd>{tool.input}</dd></div>
                        <div><dt>Agent-ready</dt><dd>{tool.agentReady}</dd></div>
                        <div><dt>License</dt><dd>{tool.license}</dd></div>
                      </dl>
                      <div className="dsl-card-best">
                        <span>Best for</span>
                        {tool.bestFor}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}

          <section className="asp-section dsl-choose">
            <div className="asp-section-heading">
              <div>
                <div className="asp-tag">// HOW TO CHOOSE</div>
                <h2>Three questions that narrow it fast.</h2>
              </div>
            </div>
            <div className="asp-outcomes">
              <article>
                <div className="asp-outcome-top"><span>Q1</span></div>
                <h3>Who is authoring?</h3>
                <p>If an AI agent writes or maintains your diagrams, pick a tool with a machine contract — Arc, or a text DSL like Mermaid and D2. Canvas tools are for human hands.</p>
              </article>
              <article>
                <div className="asp-outcome-top"><span>Q2</span></div>
                <h3>Does it live in the repo?</h3>
                <p>If the diagram must be versioned, diffed, and reviewed in pull requests, choose diagrams-as-code (Arc, Mermaid, D2, PlantUML, likec4) over SaaS canvases.</p>
              </article>
              <article>
                <div className="asp-outcome-top"><span>Q3</span></div>
                <h3>One picture or a living model?</h3>
                <p>For a single illustrative diagram, anything works. For architecture that stays in sync across many views and audiences, use a model-driven tool: Structurizr, IcePanel, or likec4.</p>
              </article>
            </div>
          </section>

          <section className="asp-section dsl-faq" id="faq">
            <div className="asp-tag">// FREQUENTLY ASKED</div>
            <h2>Questions people actually ask.</h2>
            <div className="dsl-faq-list">
              {faqs.map((faq) => (
                <article key={faq.q}>
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="asp-cta">
            <div>
              <div className="asp-eyebrow">// THE AGENT-NATIVE PICK</div>
              <h2>Diagrams your agent can actually own.</h2>
            </div>
            <div className="asp-actions">
              <Link className="asp-button asp-button-primary" to="/mcp">Add the Arc MCP server <ArrowRight aria-hidden="true" /></Link>
              <Link className="asp-button asp-button-secondary" to="/docs">Read the docs</Link>
            </div>
          </section>
        </main>

        <footer className="asp-footer">
          <span>ARC · AGENT-NATIVE DIAGRAMS</span>
          <span>JSON / TS → VALIDATE → RENDER → REVIEW</span>
        </footer>
      </div>
    </div>
  )
}
