import { TopBar, Footer } from '../components/Chrome.jsx';

export default function Privacy() {
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero"><h1 class="reveal">Privacy policy</h1></section>
        <section class="prose">
          <h2>Who is responsible</h2>
          <p>Ravel Materials SAS, 12 Rue de la Chimie Verte, 69003 Lyon, France, is the controller for the personal data this site processes.</p>
          <h2>Your rights</h2>
          <p>Address a rights request to <span class="mono">privacy@example.com</span>. Address a disclosure to <span class="mono">security@example.com</span>.</p>
          <h2>How long we keep things</h2>
          <div class="table-wrap">
            <table class="spec">
              <caption>Retention, in months, for every purpose</caption>
              <thead><tr><th scope="col">Purpose</th><th scope="col">Months</th></tr></thead>
              <tbody>
                <tr><td>An enquiry</td><td class="mono">24</td></tr>
                <tr><td>A waste-supply enquiry</td><td class="mono">36</td></tr>
                <tr><td>A polymer enquiry</td><td class="mono">36</td></tr>
                <tr><td>A press enquiry</td><td class="mono">12</td></tr>
                <tr><td>An account and its acts</td><td class="mono">120</td></tr>
                <tr><td>The record</td><td class="mono">180</td></tr>
              </tbody>
            </table>
          </div>
          <h2>The operational record</h2>
          <p>The operational record names individuals. It is retained under a legal and scheme obligation, and it is not erased on request. A former employee's contact detail is erased on request; their acts in the record are not.</p>
          <h2>What we collect at the point of collection</h2>
          <p>The enquiry form states who receives the data, what it is used for, how long it is kept, and how to have it removed. Nothing else on the public site collects anything.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
