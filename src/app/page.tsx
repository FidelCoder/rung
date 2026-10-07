import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { amount, days, short } from '@/lib/format';
import { loadDiscoveredProjects, loadDiscoveredRounds } from '@/lib/discovery.server';

export const dynamic = 'force-dynamic';

function fundingPercent(raised: string, goal: string) {
  const target = BigInt(goal);
  if (target <= 0n) return 0;
  return Math.min(100, Number((BigInt(raised) * 100n) / target));
}

export default async function HomePage() {
  const [projects, rounds] = await Promise.all([loadDiscoveredProjects(), loadDiscoveredRounds()]);
  const openRound = rounds.find(round => !round.finalized && !round.cancelled) ?? rounds[0];

  return (
    <div className="rung-home">
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="hero-copy">
            <h1>Fund the work.<br /><em>One step</em> at a time.</h1>
            <p className="hero-description">
              Rung helps BOT Chain builders raise for a clear deliverable, show what shipped,
              and move on to the next stage.
            </p>
            <div className="hero-actions">
              <Link href="/new" className="button-launch">
                Launch project <ArrowUpRight aria-hidden="true" />
              </Link>
              <Link href="#projects" className="button-text">
                Explore projects <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="hero-principles" aria-label="How Rung works">
              <span>Clear milestones</span><i />
              <span>Public decisions</span><i />
              <span>Funds in escrow</span>
            </div>
          </div>

          <div className="hero-art" aria-label="A project moves forward through three clear steps">
            <div className="art-grain" />
            <div className="art-heading">
              <span>GOOD WORK, IN GOOD ORDER</span>
              <span>01 — 03</span>
            </div>
            <div className="art-steps">
              <div className="art-step art-step-one">
                <span className="art-step-number">01</span>
                <span className="art-step-copy"><strong>Set the goal</strong><small>One useful deliverable</small></span>
                <span className="art-check"><Check aria-hidden="true" /></span>
              </div>
              <div className="art-step art-step-two">
                <span className="art-step-number">02</span>
                <span className="art-step-copy"><strong>Back the work</strong><small>Milestone by milestone</small></span>
                <span className="art-check"><Check aria-hidden="true" /></span>
              </div>
              <div className="art-step art-step-three">
                <span className="art-step-number">03</span>
                <span className="art-step-copy"><strong>Show what shipped</strong><small>Proof opens the next rung</small></span>
                <span className="art-step-arrow"><ArrowUpRight aria-hidden="true" /></span>
              </div>
            </div>
            <div className="art-caption"><span>THE NEXT STEP IS EARNED</span><span className="art-caption-line" /></div>
            <div className="art-stamp"><span>R</span><small>BUILD<br />IN PUBLIC</small></div>
          </div>
        </div>
        <div className="hero-baseline">
          <div className="home-width hero-baseline-inner">
            <span>Small promises. Real progress.</span>
            <span>STAGED FUNDING ON BOT CHAIN <b>↘</b></span>
          </div>
        </div>
      </section>

      <section id="projects" className="home-section projects-section">
        <div className="home-width">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-mark" /> OPEN PROJECTS</p>
              <h2>Good work is<br /><em>worth backing.</em></h2>
            </div>
            <div className="section-sidecopy">
              <p>Back a specific next step. Follow the progress. See what your contribution helped make.</p>
              <Link href="#projects" className="quiet-link">Browse projects <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="empty-projects">
              <p>No projects have opened a stage yet.</p>
              <Link href="/new" className="quiet-link">Launch the first project <ArrowRight aria-hidden="true" /></Link>
            </div>
          ) : (
            <div className="project-grid">
              {projects.map((project, index) => {
                const stage = project.stage;
                const progress = stage ? fundingPercent(stage.raised, stage.goal) : 0;
                return (
                  <Link key={project.id} href={`/project/${project.id}`} className={`project-tile project-tile-${index + 1}`}>
                    <div className="tile-topline">
                      <span>{project.category}</span>
                      <span className="tile-index">0{index + 1}</span>
                    </div>
                    <h3>{project.name}<ArrowUpRight aria-hidden="true" /></h3>
                    <p className="tile-description">{project.description}</p>
                    {stage ? (
                      <div className="tile-funding">
                        <div className="tile-progress-label">
                          <strong>{amount(stage.raised, stage.decimals)} <span>{stage.symbol}</span></strong>
                          <span>{progress}% of {amount(stage.goal, stage.decimals)} {stage.symbol}</span>
                        </div>
                        <div className="tile-progress-track"><span style={{ width: `${progress}%` }} /></div>
                        <div className="tile-bottomline">
                          <span>Stage {project.stageNumber} · {project.verified ? 'Verified' : 'In progress'}</span>
                          <span>{days(stage.deadline)}d left</span>
                        </div>
                      </div>
                    ) : (
                      <div className="tile-bottomline tile-bottomline-alone">
                        <span>Stage {project.stageNumber}</span><span>{short(project.builder)}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="home-section how-section">
        <div className="home-width how-inner">
          <div className="how-intro">
            <p className="eyebrow"><span className="eyebrow-mark" /> A BETTER WAY TO FUND BUILDING</p>
            <h2>Make the next step<br /><em>easy to see.</em></h2>
            <p>Projects move forward in public, with a clear goal for each stage and a record of every decision.</p>
          </div>
          <div className="how-list">
            <article className="how-row">
              <span className="how-number">01</span>
              <div><h3>Choose one deliverable</h3><p>Builders set a goal, a deadline, and acceptance criteria before asking for support.</p></div>
              <ArrowUpRight aria-hidden="true" />
            </article>
            <article className="how-row">
              <span className="how-number">02</span>
              <div><h3>Fund a stage together</h3><p>Backers contribute to an isolated escrow and can track the raise as it happens.</p></div>
              <ArrowUpRight aria-hidden="true" />
            </article>
            <article className="how-row">
              <span className="how-number">03</span>
              <div><h3>Show the work</h3><p>Evidence and review decisions stay public. Approved work makes the next stage possible.</p></div>
              <ArrowUpRight aria-hidden="true" />
            </article>
          </div>
        </div>
      </section>

      <section className="home-section rounds-section">
        <div className="home-width rounds-band">
          <div>
            <p className="eyebrow"><span className="eyebrow-mark" /> AFTER THE WORK</p>
            <h2>Good outcomes<br /><em>deserve recognition.</em></h2>
            <p>Retro rounds reward builders for results they can show and others can verify.</p>
            <Link href="/rounds" className="button-paper">Explore retro rounds <ArrowRight aria-hidden="true" /></Link>
          </div>
          {openRound ? (
            <Link href={`/rounds/${openRound.address}`} className="round-note">
              <span className="round-note-label">CURRENT ROUND</span>
              <h3>{openRound.title}</h3>
              <p>{openRound.description}</p>
              <div className="round-note-bottom"><strong>{amount(openRound.budget, openRound.decimals)} {openRound.symbol}</strong><span>View round <ArrowUpRight aria-hidden="true" /></span></div>
            </Link>
          ) : (
            <div className="round-note round-note-empty"><span className="round-note-label">NEXT UP</span><h3>A round for shipped work.</h3><p>Check back when the next retrofunding round opens.</p></div>
          )}
        </div>
      </section>

      <section className="home-closer">
        <div className="home-width closer-inner">
          <p className="eyebrow"><span className="eyebrow-mark" /> YOUR NEXT STEP STARTS HERE</p>
          <h2>Have something<br /><em>useful to build?</em></h2>
          <Link href="/new" className="button-launch button-launch-light">Launch project <ArrowUpRight aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}
