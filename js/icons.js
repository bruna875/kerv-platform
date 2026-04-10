// icons.js — SVG icons only

var ico = {
  roadmap: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="4" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="7" y="6.5" width="4" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="10" width="4" height="3" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M6 5.5L8 6.5M8.5 9.5L7 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  capacity: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="6" r="2.5" stroke="currentColor" stroke-width="1.4" opacity=".7"/><circle cx="11" cy="6" r="2.5" stroke="currentColor" stroke-width="1.4" opacity=".4"/><path d="M1 14c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/><path d="M11 10c1.7.4 3 1.9 3 3.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".4"/></svg>'
};

var NAV_CONFIG = [
  {
    section: 'Product',
    items: [
      { id: 'roadmap',      label: 'Product Roadmap', icon: ico.roadmap },
      { id: 'teamcapacity', label: 'Team Capacity',   icon: ico.capacity }
    ]
  }
];
