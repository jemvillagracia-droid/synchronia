// CV layout helpers: the contact line breaks only between items, and the left date column holds only the dates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { contactLines, splitColumnDate } = await import('../src/cv/contact.js');

test('contact line breaks between items, never inside an address or link', () => {
  const items = ['maria.santos@urs.edu.ph', '+63 917 555 0142', 'Morong, Rizal, Philippines', 'https://orcid.org/0000-0002-1825-0097'];
  const narrow = contactLines(items, { widthIn: 6.5, sizePt: 11 });
  assert.ok(narrow.length >= 2, 'a long contact line is split');
  assert.deepEqual(narrow.flat(), items, 'every item kept whole and in order');
  assert.ok(narrow.every((l) => l.length >= 1));
  assert.deepEqual(contactLines(items.slice(0, 2), { widthIn: 6.5, sizePt: 11 }), [items.slice(0, 2)], 'a short line stays one line');
  assert.deepEqual(contactLines(['a-very-long-single-link-that-is-longer-than-the-line-itself.example.edu/path/to/page'], { widthIn: 2, sizePt: 11 }).length, 1);
});

test('left date column keeps only the dates; the rest moves under the title', () => {
  assert.deepEqual(splitColumnDate('Mar 2023 · Valid until Mar 2026'), { date: 'Mar 2023', extra: 'Valid until Mar 2026' });
  assert.deepEqual(splitColumnDate('Jun 2016 – May 2020'), { date: 'Jun 2016 – May 2020', extra: '' });
  assert.deepEqual(splitColumnDate(null), { date: '', extra: '' });
});
