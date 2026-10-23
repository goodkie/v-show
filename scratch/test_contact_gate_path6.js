const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ContactGate = require('../extension/modules/contact-gate.js');

async function test() {
    console.log('Testing ContactGate Path 6 on liveyourtoplife.com form...');
    
    // 1. liveyourtoplife form
    const formHtml = `
    <form method="post" action="#" class="mm-custom-form mm-custom-form-home" id="mm-custom-form-home1082758584" data-instance="1082758584">
        <fieldset>
            <div class="gform_body">
                <ul class="gform_fields">
                    <li class="gfield full-name-field">
                        <label for="form-full-name">Full Name</label>
                        <input type="text" name="full_name" class="full-name" placeholder="Full Name" maxlength="30" id="form-full-name" required>
                    </li>
                    <li class="gfield">
                        <label for="form-email-address">Email</label>
                        <input type="text" name="email" placeholder="Email address for info" class="email-field" id="form-email-address" required>
                    </li>
                    <li class="gfield">
                        <label for="form-phone-number">Phone Number</label>
                        <input type="tel" name="phone" placeholder="Mobile # for info via text" class="phone-field" minlength="7" required id="form-phone-number">
                    </li>
                    <li class="gfield field-program">
                        <label for="form-program">Program</label>
                        <select name="program" class="mm-programs" id="form-program" required>
                            <option value="">Select a Program</option>
                            <option value="217">Lil Ninjas (Ages 3-4)</option>
                        </select>
                    </li>
                </ul>
            </div>
            <div class="gform_footer top_label">
                <input type="submit" name="submit" value="SEE CLASS SCHEDULE & PRICING NOW">
            </div>
        </fieldset>
    </form>`;

    const dom = new JSDOM(formHtml);
    const form = dom.window.document.querySelector('form');
    
    const body = ContactGate.detectInquiryBodyField(form);
    console.log('detectInquiryBodyField:', body);
    assert(body, 'Must detect inquiry body via Path 6');
    assert.strictEqual(body.type, 'lead-inquiry-form');

    const classification = ContactGate.classifyFormIntent(form);
    console.log('classifyFormIntent:', classification);
    assert.strictEqual(classification.eligible, true, 'Form must be eligible');
    assert.strictEqual(classification.intent, 'CONTACT_INQUIRY', 'Intent must be CONTACT_INQUIRY');
    assert(classification.score > 0, 'Score must be > 0');

    // 2. Negative Control: Search Form
    const searchHtml = `<form action="/search"><input type="text" name="q"><input type="submit" value="Search"></form>`;
    const searchDom = new JSDOM(searchHtml);
    const searchForm = searchDom.window.document.querySelector('form');
    const searchClass = ContactGate.classifyFormIntent(searchForm);
    console.log('Search form eligible:', searchClass.eligible);
    assert.strictEqual(searchClass.eligible, false, 'Search form must be rejected');

    // 3. Negative Control: Newsletter Form (only email, no name/phone)
    const newsHtml = `<form action="/newsletter"><input type="email" name="email"><input type="submit" value="Subscribe"></form>`;
    const newsDom = new JSDOM(newsHtml);
    const newsForm = newsDom.window.document.querySelector('form');
    const newsClass = ContactGate.classifyFormIntent(newsForm);
    console.log('Newsletter form eligible:', newsClass.eligible);
    assert.strictEqual(newsClass.eligible, false, 'Newsletter form must be rejected');

    console.log('ALL PATH 6 TESTS PASSED!');
}

test().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
