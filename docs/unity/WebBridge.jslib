// Place in Assets/Plugins/WebGL/. Forwards Unity -> web events to the host page.
mergeInto(LibraryManager.library, {
  PolarTwinEmit: function (ptr) {
    var json = UTF8ToString(ptr);
    if (typeof window.polartwinEmit === 'function') window.polartwinEmit(json);
  }
});
