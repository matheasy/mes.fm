@@H2 The two ideas everything rests on
<p>Special relativity needs just two assumptions, both well tested:</p>
<ol class="te-list">
<li><b>The laws of physics are the same for everyone moving at a steady speed.</b> There is no experiment that can tell you that you are "really" at rest.</li>
<li><b>Light moves at the same speed $c$ for every observer</b> ($c = 299{,}792{,}458$ m/s), however fast the source or the observer is moving.</li>
</ol>
<p>The second idea is the strange one. If you run at a beam of light it still passes you at $c$. Something has to give so that this stays true, and what gives is <em>time</em> (and distance). Time dilation is the consequence you can work out with nothing more than Pythagoras.</p>

@@H2 Derivation 1: the light clock
<p>Build the simplest clock imaginable: a pulse of light bouncing between two mirrors a distance $L$ apart. One tick is one round trip. In the clock's own frame the light travels $2L$ at speed $c$, so</p>
$$ \Delta\tau = \frac{2L}{c} $$
<p>This is the clock's <b>proper time</b>: the time measured by a clock that is at rest next to the events. Now set the clock moving sideways at speed $v$ (the mirrors are perpendicular to the motion). A friend who is not moving watches it go past. During one tick, which lasts $\Delta t$ for her, the clock slides along by $v\,\Delta t$, so the light follows a slanted path: up to the far mirror, then back down.</p>
<figure class="te-fig"><svg viewBox="0 0 520 190" role="img" aria-label="Light clock moving sideways: the light path is the hypotenuse of a right triangle with legs L and v t over 2"><defs><marker id="ar" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,1 L11,6 L0,11 z" fill="currentColor"/></marker></defs>
<line x1="40" y1="160" x2="480" y2="160" stroke="currentColor" stroke-opacity=".4"/><line x1="40" y1="30" x2="480" y2="30" stroke="currentColor" stroke-opacity=".4"/>
<line x1="80" y1="160" x2="260" y2="30" stroke="#c2255c" stroke-width="3" marker-end="url(#ar)"/><line x1="260" y1="30" x2="440" y2="160" stroke="#c2255c" stroke-width="3" marker-end="url(#ar)"/>
<line x1="260" y1="30" x2="260" y2="160" stroke="currentColor" stroke-dasharray="5 4"/><line x1="80" y1="175" x2="260" y2="175" stroke="currentColor" marker-end="url(#ar)"/>
<text x="268" y="100" font-size="15" fill="currentColor">L</text><text x="150" y="190" font-size="14" fill="currentColor">v&#916;t / 2</text><text x="140" y="85" font-size="14" fill="#c2255c">c&#916;t / 2</text><text x="60" y="150" font-size="12" fill="currentColor">start</text><text x="425" y="150" font-size="12" fill="currentColor">end</text></svg>
<figcaption>Seen from outside, the light covers the slanted sides. The right triangle has legs $L$ and $v\Delta t/2$, and hypotenuse $c\Delta t/2$.</figcaption></figure>
<p>Light still travels at $c$ in her frame, so each slanted half is $c\,\Delta t/2$ long. Pythagoras on the right triangle gives</p>
$$ \Big(\frac{c\,\Delta t}{2}\Big)^2 = L^2 + \Big(\frac{v\,\Delta t}{2}\Big)^2 $$
<p>Collect the $\Delta t$ terms:</p>
$$ \frac{\Delta t^2}{4}\,(c^2 - v^2) = L^2 \quad\Longrightarrow\quad \Delta t = \frac{2L/c}{\sqrt{1 - v^2/c^2}} $$
<p>The numerator is exactly the proper time $\Delta\tau = 2L/c$. So</p>
$$ \boxed{\;\Delta t = \gamma\,\Delta\tau\;},\qquad \gamma = \frac{1}{\sqrt{1 - v^2/c^2}} $$
<p>The moving clock ticks slower by the factor $\gamma$. Because every process in nature can be compared with a light clock (otherwise you could tell who is really moving, breaking the first idea), <em>all</em> clocks, hearts and chemical reactions slow down together.</p>

@@H2 What the Lorentz factor looks like
<p>$\gamma$ is 1 at rest and grows slowly at first, then explodes as $v$ approaches $c$:</p>
<div class="tu-table-wrap"><table class="tu-table te-tbl"><thead><tr><th>Speed</th><th>$\gamma$</th><th>A year on the ship equals</th><th>Example</th></tr></thead><tbody>
<tr><td>0.1 c</td><td>1.005</td><td>1.005 years at home</td><td>30,000 km/s</td></tr>
<tr><td>0.5 c</td><td>1.155</td><td>1.15 years</td><td></td></tr>
<tr><td>0.8 c</td><td>1.667</td><td>1.67 years</td><td>the 3-4-5 triangle: $\gamma = 5/3$</td></tr>
<tr><td>0.9 c</td><td>2.294</td><td>2.29 years</td><td></td></tr>
<tr><td>0.99 c</td><td>7.089</td><td>7.09 years</td><td></td></tr>
<tr><td>0.999 c</td><td>22.37</td><td>22 years</td><td>cosmic-ray muons</td></tr>
<tr><td>0.9999 c</td><td>70.71</td><td>71 years</td><td></td></tr>
</tbody></table></div>
<p class="te-note">Everyday speeds are tiny compared with $c$: a jet at 900 km/h has $\gamma - 1 \approx 3\times10^{-13}$, which is why we never notice. Airborne atomic clocks can, though (Hafele and Keating, 1971).</p>

@@H2 Proper time: the clock you carry
<p>The quantity $\Delta\tau$ has a name: the <b>proper time</b> between two events is the time shown on a clock that travels from one to the other. For a speed that changes, add up tiny pieces:</p>
$$ \tau = \int \sqrt{1 - \frac{v(t)^2}{c^2}}\;dt $$
<p>It is the relativistic version of "distance travelled along a path": different paths between the same two events have different proper times, and the straight, steady path takes the <em>longest</em>. That one fact explains the twin paradox.</p>

@@H2 Derivation 2: length contraction
<p>Take a trip of distance $d$ (measured by the people at home, e.g. the Earth and a star at rest relative to each other). At speed $v$ it takes $t = d/v$ for them. The traveller's clock runs slow, so she experiences</p>
$$ \tau = \frac{t}{\gamma} = \frac{d}{\gamma v} $$
<p>From her point of view the star approaches at speed $v$ and arrives after $\tau$. So <em>she</em> measures the distance as $v\tau = d/\gamma$:</p>
$$ \boxed{\;L = \frac{L_0}{\gamma}\;} $$
<p>Time dilation and length contraction are the same effect seen from the two sides. This also resolves the muon puzzle: muons made 15 km up live only 2.2 microseconds, enough to travel 0.66 km at $0.995c$, yet they reach the ground. In our frame their clocks run slow ($\gamma \approx 10$: 22 microseconds, 6.6 km). In the muon's frame the atmosphere is squashed to a tenth of its height.</p>

@@H2 Worked example: Proxima Centauri at 0.9 c
<p>Proxima is $d = 4.25$ light-years away. At $v = 0.9c$ (so $\gamma = 2.294$):</p>
<ul class="te-list">
<li>Time on Earth: $t = d/v = 4.25/0.9 = 4.72$ years.</li>
<li>Time on the ship: $\tau = t/\gamma = 4.72/2.294 = 2.06$ years.</li>
<li>Distance the traveller measures: $d/\gamma = 1.85$ light-years (and $1.85/0.9 = 2.06$ years: consistent).</li>
</ul>
<p>You can check any of these in the <a href="/time-dilation?tab=calc">Calculator tab</a> of the simulator.</p>

@@H2 The twin paradox
<p>Each twin sees the other's clock run slow, so who is younger when they meet again? The answer is the traveller, because the situation is not symmetric: to come back she must <b>turn round</b>, which means accelerating, and her path through space-time is not the steady straight one. Using the proper-time integral above, a path with turns always has less proper time than the straight path between the same two events (the stay-at-home twin's). Equivalently, she switches from one inertial frame to another, and "now" at home jumps ahead in her bookkeeping at the turn-round.</p>

@@H2 Derivation 3: travelling at a constant 1 g
<p>A ship can accelerate at $a = 1\,g \approx 9.8$ m/s&sup2; for years, which gives Earth-like gravity and is the usual dream of fast interstellar travel. At large speeds you cannot just add $a\,t$ to the speed (it would pass $c$). Describe the motion with <b>rapidity</b> $\varphi$, defined by $v = c\tanh\varphi$ (so $\gamma = \cosh\varphi$). Constant proper acceleration means the rapidity grows steadily with the ship's own clock:</p>
$$ \varphi = \frac{a\,\tau}{c} $$
<p>Integrating $dx = v\,dt$ and $dt = \gamma\,d\tau$ with $\gamma = \cosh\varphi$ and $v\gamma = c\sinh\varphi$ gives the time and distance covered from rest:</p>
$$ t = \frac{c}{a}\sinh\frac{a\tau}{c},\qquad x = \frac{c^2}{a}\Big(\cosh\frac{a\tau}{c} - 1\Big) $$
<p>For a trip of distance $d$ that accelerates for the first half and brakes for the second half, the ship covers $d/2$ while speeding up. Solve $\tfrac{d}{2} = \tfrac{c^2}{a}(\cosh\varphi - 1)$ for the rapidity $\varphi$ reached at the half-way point:</p>
$$ \cosh\varphi = 1 + \frac{a\,d}{2c^2} \quad\Longrightarrow\quad \tau_\text{total} = 2\,\frac{c}{a}\,\varphi = \boxed{\;\frac{2c}{a}\cosh^{-1}\!\Big(1 + \frac{a\,d}{2c^2}\Big)\;} $$
<p>This is the "constant 1 g" equation in the simulator's Twin trip tab. Numbers: Proxima (4.25 light-years) takes <b>3.5 years</b> on the ship; the Andromeda galaxy (2.5 million light-years) takes about <b>28.6 years</b> on the ship (while about 2.5 million years pass on Earth).</p>

@@H2 Why nothing with mass can reach c
<p>The energy of a moving object of mass $m$ is $E = \gamma m c^2$; at rest it is $mc^2$. The extra is its kinetic energy:</p>
$$ E_k = (\gamma - 1)\,m c^2 \;\approx\; \tfrac12 m v^2 \quad (v \ll c) $$
<p>For small speeds the series expansion $\gamma \approx 1 + v^2/2c^2$ gives back the familiar $\tfrac12 m v^2$. But as $v \to c$, $\gamma \to \infty$ and so does the energy needed. For one kilogram at $0.9c$ you need $(\gamma - 1)c^2 = 1.16\times10^{17}$ J, about the energy a large power station makes in a year; at $0.999c$ it is 17 times more.</p>

@@H2 Common misunderstandings
<ul class="te-list">
<li><b>"The clock only looks slow because of the time light takes to arrive."</b> No: that Doppler effect is a separate, easily corrected effect. Time dilation is what remains after correcting for it.</li>
<li><b>"It is only a measurement trick."</b> No: muon lifetimes, particle accelerators, atomic clocks on aircraft and GPS satellites all show the effect. GPS corrects for it (and for gravity, which acts the opposite way) every day.</li>
<li><b>"Then I can go back in time by going fast."</b> No: speed lets you reach the future faster (fewer of your own ticks), never the past.</li>
<li><b>"Nobody feels time slow down."</b> Right: on the ship everything runs together, so nothing feels different. You only notice by comparing with a clock that stayed home.</li>
</ul>

@@H2 Try it yourself
<p>Answers are hidden: work them out first, then check, or use the <a href="/time-dilation?tab=calc">simulator's calculator</a>.</p>
<details class="te-q"><summary>1. At what speed is $\gamma = 2$?</summary><p>$1/\sqrt{1 - \beta^2} = 2 \Rightarrow 1 - \beta^2 = 1/4 \Rightarrow \beta = \sqrt{3}/2 \approx 0.866$, so $v = 0.866c$.</p></details>
<details class="te-q"><summary>2. A ship travels at 0.6c for 10 years (Earth time). How old do the passengers get?</summary><p>$\gamma = 1.25$, so $\tau = 10/1.25 = 8$ years.</p></details>
<details class="te-q"><summary>3. How long does a 12 light-year trip at 0.6c take on the ship?</summary><p>Earth time $t = 12/0.6 = 20$ years, so $\tau = 20/\gamma = 20/1.25 = 16$ years. (Check with contraction: $12/1.25 = 9.6$ light-years at 0.6c is 16 years.)</p></details>
<details class="te-q"><summary>4. A muon has a rest lifetime of 2.2 microseconds and moves at 0.9994c ($\gamma \approx 29$). How far does it travel in the lab?</summary><p>Lab lifetime $\approx 29\times2.2 = 64$ microseconds, distance $\approx 0.9994\times 3\times10^8\times 64\times10^{-6}\approx 19$ km (without dilation: 0.66 km).</p></details>
<details class="te-q"><summary>5. Show that $\gamma \approx 1 + \tfrac12 v^2/c^2$ for small $v$.</summary><p>Binomial expansion: $(1 - x)^{-1/2} \approx 1 + \tfrac12 x$ with $x = v^2/c^2$.</p></details>
