const test = require('node:test');
const assert = require('node:assert/strict');

const safeDom = require('../public/js/safe-dom.js');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.selected = false;
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
  }

  get firstChild() {
    return this.children[0] || null;
  }
}

test('appendOption stores malicious strings as text content (not HTML)', () => {
  global.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };

  const select = new FakeElement('select');
  const payload = '<img src=x onerror=alert(1) />';

  const option = safeDom.appendOption(select, 7, payload, true);

  assert.equal(option.value, '7');
  assert.equal(option.selected, true);
  assert.equal(option.textContent, payload);
  assert.equal(select.children.length, 1);
});

test('escapeHtml neutralizes dangerous HTML characters', () => {
  const escaped = safeDom.escapeHtml('<img src=x onerror="boom">');
  assert.equal(escaped, '&lt;img src=x onerror=&quot;boom&quot;&gt;');
});
