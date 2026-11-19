import type { ReactNode } from 'react';

interface ItemView {
  tone: 'dark' | 'light' | 'line' | 'chip';
  body: ReactNode;
}

const Meta = ({ n, label }: { n: string; label: string }) => (
  <div className="meta">
    <span>{n}</span>
    <span>{label}</span>
  </div>
);

export const ITEM_VIEWS: Record<string, ItemView> = {
  material: {
    tone: 'dark',
    body: (
      <>
        <Meta n="01" label="Material" />
        <h3>The interface is a material.</h3>
        <p>Every element here has mass, friction and a breaking point.</p>
      </>
    ),
  },
  pick: {
    tone: 'light',
    body: (
      <>
        <Meta n="02" label="Handling" />
        <h3 className="big">Pick me up.</h3>
        <p>Hold. Drag. Release.</p>
      </>
    ),
  },
  tolerance: {
    tone: 'line',
    body: (
      <>
        <Meta n="03" label="Tolerance" />
        <h3>Nothing breaks until it is hit hard enough.</h3>
      </>
    ),
  },
  index: {
    tone: 'dark',
    body: (
      <>
        <Meta n="—" label="Index" />
        <ul className="index">
          <li>
            <span>001</span>Mass
          </li>
          <li>
            <span>002</span>Friction
          </li>
          <li>
            <span>003</span>Impact
          </li>
          <li>
            <span>004</span>The centre
          </li>
        </ul>
      </>
    ),
  },
  drop: {
    tone: 'line',
    body: (
      <>
        <Meta n="04" label="Instruction" />
        <h3 className="mid">Throw it at the centre.</h3>
      </>
    ),
  },
  about: { tone: 'chip', body: 'About' },
  work: { tone: 'chip', body: 'Work' },
  lab: { tone: 'chip', body: 'Lab' },
  journal: { tone: 'chip', body: 'Journal' },
  contact: { tone: 'chip', body: 'Contact' },
};
