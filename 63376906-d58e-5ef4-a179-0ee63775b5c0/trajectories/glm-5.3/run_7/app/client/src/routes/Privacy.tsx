import { Reveal } from '../components/Reveal';

export default function Privacy() {
  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Privacy policy</Reveal>
        <Reveal as="p" class="lede">What Ravel keeps, why, for how long, and how to have it removed.</Reveal>
      </section>

      <section class="shell section">
        <div class="measure">
          <h2>The controller</h2>
          <p>Ravel Materials SAS is the controller for the data described here.</p>
          <p>Ravel Materials SAS, 14 quai Rambaud, 69002 Lyon, France.</p>
          <p>Address for a rights request: <span class="mono">privacy@example.com</span>. Disclosure address: <span class="mono">security@example.com</span>.</p>

          <h2>Retention in months, for every purpose</h2>
          <div class="table-scroll">
            <table class="sheet">
              <thead><tr><th scope="col">Purpose</th><th scope="col" class="num">Retention (months)</th></tr></thead>
              <tbody>
                <tr><td>An enquiry</td><td class="num">24</td></tr>
                <tr><td>A waste-supply enquiry</td><td class="num">36</td></tr>
                <tr><td>A polymer enquiry</td><td class="num">36</td></tr>
                <tr><td>A press enquiry</td><td class="num">12</td></tr>
                <tr><td>An account and its acts</td><td class="num">120</td></tr>
                <tr><td>The record</td><td class="num">180</td></tr>
              </tbody>
            </table>
          </div>

          <h2>The operational record names individuals</h2>
          <p>It is stated plainly: the operational record names individuals. It is retained under a legal and scheme obligation, and it is not erased on request. A former employee’s contact detail is erased; their acts in the record are not.</p>

          <h2>What the console collects</h2>
          <p>Authentication is delegated to our identity provider; the console holds a session token for twelve hours and nothing else on your device. Every act in the console is written to the record with the person, the moment, the site and the object.</p>

          <h2>Your rights</h2>
          <p>Write to <span class="mono">privacy@example.com</span> to ask what we hold, to correct it, or to have it removed where the retention above permits. Where it does not, we will say so and say why.</p>
        </div>
      </section>
    </div>
  );
}
