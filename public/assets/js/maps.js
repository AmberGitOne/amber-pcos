/* ============================================================================
 * Amber LifeSciences — maps.js
 * Real interactive maps + live geolocation.
 * Uses Google Maps when a key is configured (localStorage 'amber_gmaps_key'),
 * otherwise falls back to Leaflet + OpenStreetMap (free, no key required).
 * ==========================================================================*/
const AmberMaps = (() => {
  let provider = null, loading = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  function ensure() {
    if (provider) return Promise.resolve(provider);
    if (loading) return loading;
    const key = (localStorage.getItem('amber_gmaps_key') || '').trim();
    loading = (async () => {
      if (key) {
        if (!window.google || !window.google.maps) {
          await loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`);
        }
        provider = 'google';
      } else {
        loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        if (!window.L) await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        provider = 'leaflet';
      }
      return provider;
    })();
    return loading;
  }

  // ---- unified map handle -------------------------------------------------
  class AmberMap {
    constructor(el, opts) {
      this.provider = provider;
      this.live = null;
      if (provider === 'google') {
        this.map = new google.maps.Map(el, { center: { lat: opts.center[0], lng: opts.center[1] }, zoom: opts.zoom || 12, mapTypeControl: true, streetViewControl: false });
        this.bounds = new google.maps.LatLngBounds();
        this.info = new google.maps.InfoWindow();
      } else {
        this.map = L.map(el).setView(opts.center, opts.zoom || 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        this._bounds = [];
      }
    }
    marker(lat, lng, o = {}) {
      const color = o.color || '#10a37f';
      if (this.provider === 'google') {
        const m = new google.maps.Marker({
          position: { lat, lng }, map: this.map, title: o.title || '',
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        });
        if (o.popup) m.addListener('click', () => { this.info.setContent(o.popup); this.info.open(this.map, m); });
        this.bounds.extend(m.getPosition());
      } else {
        const m = L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(this.map);
        if (o.popup) m.bindPopup(o.popup);
        if (o.title && !o.popup) m.bindTooltip(o.title);
        this._bounds.push([lat, lng]);
      }
    }
    circle(lat, lng, radius, o = {}) {
      const color = o.color || '#10a37f';
      if (this.provider === 'google') {
        new google.maps.Circle({ center: { lat, lng }, radius, map: this.map, strokeColor: color, strokeOpacity: .6, strokeWeight: 1, fillColor: color, fillOpacity: .12 });
      } else {
        L.circle([lat, lng], { radius, color, weight: 1, opacity: .6, fillColor: color, fillOpacity: .12 }).addTo(this.map);
      }
    }
    polyline(coords, o = {}) {
      const color = o.color || '#3b82f6';
      if (!coords.length) return;
      if (this.provider === 'google') {
        new google.maps.Polyline({ path: coords.map(c => ({ lat: c[0], lng: c[1] })), map: this.map, strokeColor: color, strokeOpacity: .9, strokeWeight: 3 });
      } else {
        L.polyline(coords, { color, weight: 3, opacity: .9, dashArray: '6 6' }).addTo(this.map);
      }
    }
    drawRoute(latlngs) {
      if (!latlngs || !latlngs.length) return;
      if (this.provider === 'google') {
        if (this._route) this._route.setMap(null);
        this._route = new google.maps.Polyline({ path: latlngs.map(c => ({ lat: c[0], lng: c[1] })), map: this.map, strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: .85 });
        const b = new google.maps.LatLngBounds(); latlngs.forEach(c => b.extend({ lat: c[0], lng: c[1] })); this.map.fitBounds(b, 50);
      } else {
        if (this._route) this.map.removeLayer(this._route);
        this._route = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: .85 }).addTo(this.map);
        this.map.fitBounds(this._route.getBounds(), { padding: [50, 50] });
      }
    }
    updateTrail(latlngs) {
      if (!latlngs || latlngs.length < 2) return;
      if (this.provider === 'google') {
        if (this._trail) this._trail.setMap(null);
        this._trail = new google.maps.Polyline({ path: latlngs.map(c => ({ lat: c[0], lng: c[1] })), map: this.map, strokeColor: '#7c3aed', strokeWeight: 3, strokeOpacity: .6 });
      } else {
        if (this._trail) this.map.removeLayer(this._trail);
        this._trail = L.polyline(latlngs, { color: '#7c3aed', weight: 3, opacity: .6, dashArray: '4 5' }).addTo(this.map);
      }
    }
    setLive(lat, lng, label) {
      if (this.provider === 'google') {
        const pos = { lat, lng };
        if (!this.live) {
          this.live = new google.maps.Marker({ position: pos, map: this.map, title: label || 'You',
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#2563eb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }, zIndex: 999 });
          this.liveCircle = new google.maps.Circle({ center: pos, radius: 120, map: this.map, strokeColor: '#2563eb', strokeOpacity: .5, strokeWeight: 1, fillColor: '#2563eb', fillOpacity: .12 });
        } else { this.live.setPosition(pos); this.liveCircle.setCenter(pos); }
        this.map.setCenter(pos); this.map.setZoom(Math.max(this.map.getZoom(), 14));
      } else {
        if (!this.live) {
          this.live = L.circleMarker([lat, lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(this.map);
          this.live.bindTooltip(label || 'You are here', { permanent: false });
          this.liveCircle = L.circle([lat, lng], { radius: 120, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: .12 }).addTo(this.map);
        } else { this.live.setLatLng([lat, lng]); this.liveCircle.setLatLng([lat, lng]); }
        this.map.setView([lat, lng], Math.max(this.map.getZoom(), 14));
      }
    }
    fit() {
      try {
        if (this.provider === 'google') { if (!this.bounds.isEmpty()) this.map.fitBounds(this.bounds, 40); }
        else if (this._bounds.length) this.map.fitBounds(this._bounds, { padding: [40, 40] });
      } catch (e) { /* ignore */ }
    }
    invalidate() { if (this.provider === 'leaflet' && this.map) setTimeout(() => this.map.invalidateSize(), 50); }
  }

  return {
    async create(elId, opts) {
      await ensure();
      const el = document.getElementById(elId);
      if (!el) throw new Error('Map container not found');
      const m = new AmberMap(el, opts);
      m.invalidate();
      return m;
    },
    activeProvider: () => provider,
    hasGoogleKey: () => !!(localStorage.getItem('amber_gmaps_key') || '').trim(),
  };
})();
