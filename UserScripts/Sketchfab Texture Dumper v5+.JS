// ==UserScript==
// @name        Sketchfab Texture Dumper V5+
// @namespace   Violentmonkey Scripts
// @match       *://*.sketchfab.com/3d-models/**
// @match       *://*.sketchfab.com/models/**
// @grant       none
// @version     0.0.3
// @author      Risk
// @create-time 2023/7/31 22:59:46
// @license     MIT
// @run-at      document-start
// ==/UserScript==
(function () {

    const MIN_TEXTURE_WIDTH = 256,
      MIN_TEXTURE_HEIGHT = 256;
    let _log = console.log;
    let _warn = console.warn;
    let model_name = location.pathname.split("/")[2];
    let model_name_arr = model_name.split("-");
    let model_id = model_name_arr[model_name_arr.length - 1];
    let downloadCnt = 0;
    let originTextureArr = [];
    if (location.href.indexOf('sketchfab.com/3d-models/') > -1) {
      return;
    }
    if (window.self !== window.top) {
      setTimeout(() => {
        addViewBtn();
      }, 3000)
      return;
    }
    _log("=======SketchfabTextureDump=======");
    if (!model_id) {
      _warn("can't find model_id!");
      return;
    } else {
      _log("model_id:", model_id);
    }
  
    window.onload = () => {
      try {
        let results = window.prefetchedData[`/i/models/${model_id}/textures?optimized=1`].results;
        coverTexture(results); // quality high
        Object.defineProperty(window.prefetchedData[`/i/models/${model_id}/textures?optimized=1`], "results", {
          get: () => {
            return results;
          }
        })
        originTextureArr = window.prefetchedData[`/i/models/${model_id}/textures?optimized=1`].results || [];
      } catch (e) {
        _warn('oops~something went wrong,u can refresh the page & try again');
      }
    }
  
    function coverTexture(results) {
      results.forEach((texture) => {
        let images = texture.images;
        let img = images[images.length - 2];
        texture.url = img.url;
        images.forEach((item, idx) => {
          images[idx] = img;
        })
      })
    }
  
    function addDownloadBtn() {
      let btn = document.createElement("button");
      btn.innerHTML = "download";
      btn.style.position = "absolute"
      btn.style.top = "0"
      btn.style.left = "0"
      document.body.appendChild(btn);
      btn.onclick = dumpWebGLTextureData;
    }
  
    function addViewBtn() {
      let btn = document.createElement("button");
      btn.innerHTML = "goto download";
      btn.style.position = "absolute"
      btn.style.top = "0"
      btn.style.left = "0"
      document.body.appendChild(btn);
      btn.onclick = () => {
        let link = document.createElement("a");
        link.setAttribute("href", `https://sketchfab.com/models/${model_id}/embed?autostart=1&internal=1&tracking=0&ui_ar=0&ui_infos=0&ui_snapshots=1&ui_stop=0&ui_theatre=1&ui_watermark=0`);
        link.setAttribute("target", "_blank");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
    }
  
    let webGLTextureIdx = 0;
    let webGLTextureMap = {};
    document.addEventListener("DOMContentLoaded", function () {
      var str = document.querySelector("#js-dom-data-prefetched-data").innerHTML.replace("\x3C!--", "").replace("-->", "").replaceAll("&#34;", "\"");
      var prefetchedData = JSON.parse(str);
      let context = prefetchedData.embedOptions.webgl2 ? WebGL2RenderingContext : WebGLRenderingContext;
      hookWebGLRenderingContext(context);
    }, false);
  
    function hookWebGLRenderingContext(context) {
      //createTexture
      let glCreateTexture = context.prototype.createTexture;
      context.prototype.createTexture = function (...args) {
        let texture = glCreateTexture.apply(this, args);
        texture.name = webGLTextureIdx;
        texture.gl = this;
        webGLTextureMap[`${webGLTextureIdx}`] = texture;
        webGLTextureIdx++;
        return texture;
      };
  
      //bindTexture
      let glBindTexture = context.prototype.bindTexture;
      context.prototype.bindTexture = function (...args) {
        let target = args[0], texture = args[1];
        if (texture) {
          texture.target = target;
        }
        glBindTexture.apply(this, args);
      };
  
      let glDeleteTexture = context.prototype.deleteTexture;
      context.prototype.deleteTexture = function (...args) {
        // do notthing
      };
  
      //texImage
      let lstTexture;
      let glTexImage2D = context.prototype.texImage2D;
      let hasCoverTex = 0;
      let isAllTextureCover = false;
      context.prototype.texImage2D = function (...args) {
        let texture = this.getParameter(this.TEXTURE_BINDING_2D) || this.getParameter(this.TEXTURE_BINDING_CUBE_MAP);
        let argments = parseTexImage2dArgs(args);
        if (texture.target == argments.target) {
          texture.args = argments;
          let { width, height, src } = argments;
          if (
            width > MIN_TEXTURE_WIDTH &&
            height > MIN_TEXTURE_HEIGHT &&
            (width & width - 1) === 0 &&
            (height & height - 1) === 0 &&
            texture.target === this.TEXTURE_2D
          ) {
            if (src) {
              // let textureName = getFileNameByLink(src);
              texture.src = argments.src;
              lstTexture.lst = texture.name;
              hasCoverTex++;
              _log(`【origin texture cover】 total:${originTextureArr.length} count:${hasCoverTex}`);
              if (originTextureArr.length == hasCoverTex) {
                isAllTextureCover = true;
                _log('all files are ready! click the 【download】 button');
                addDownloadBtn();
              }
            }
            lstTexture = texture;
          }
        }
        glTexImage2D.apply(this, args);
      };
    }
  
    function parseTexImage2dArgs(args) {
      let argments = {};
      if (args.length == 6) {
        let [target, level, internalformat, format, type, source] = args;
        let { width, height, src } = source;
        argments = { target, level, width, height, internalformat, format, type, src };
      } else if (args.length == 9) {
        let [
          target,
          level,
          internalformat,
          width,
          height,
          border,
          format,
          type,
          pixels,
        ] = args;
        argments = { target, level, width, height, format, internalformat, type };
      } else {
        let [target] = args;
        argments = { target };
      }
      return argments;
    }
  
    function readWebTextureData(texture) {
      let { target, gl, args, src, lst } = texture;
      if (!args) { // todo maybe other func bind
        return
      }
      let { level, width, height, format, internalformat, type } = args;
      if (
        width > MIN_TEXTURE_WIDTH &&
        height > MIN_TEXTURE_HEIGHT &&
        (width & width - 1) === 0 &&
        (height & height - 1) === 0 &&
        target === gl.TEXTURE_2D &&
        !src
      ) {
        let fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          level
        );
        let framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (
          framebufferStatus == gl.FRAMEBUFFER_COMPLETE
        ) {
          let fileName = `${Date.now()}.png`;
          let originName = fileName;
          let originTex = webGLTextureMap[lst];
          if (originTex) {
            if (originTex && originTex.src) {
              let path = originTex.src.split("/");
              let uid = path[path.length - 2];
              originName = getNameById(uid);
            }
            if (fileName == originName || !originName) { return }
            let pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, format, type, pixels);
            let canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            let context = canvas.getContext("2d");
            let imageData = context.createImageData(width, height);
            imageData.data.set(pixels);
            context.putImageData(imageData, 0, 0);
            downloadCnt++;
            downLoadByLink(canvas.toDataURL(), originName); // todo format
          }
        }
      }
    }
  
    function dumpWebGLTextureData() {
      downloadCnt = 0;
      for (let key in webGLTextureMap) {
        readWebTextureData(webGLTextureMap[key]);
      }
      if (downloadCnt == originTextureArr.length) {
        _log(`【dump texture:${downloadCnt}/${originTextureArr.length}】 success！`);
      } else {
        _log(`【dump texture:${downloadCnt}/${originTextureArr.length}】oops~something went wrong,u can refresh the page & try again`);
      }
    }
  
    function getNameById(uid) {
      let name;
      let texture = originTextureArr.find((t) => {
        return t.uid == uid;
      });
      if (texture) {
        name = texture.name;
      }
      return name;
    }
  
  
    function downLoadByLink(url, filename) {
      let link, evt;
      link = document.createElement('a');
      link.href = url;
      filename && link.setAttribute('download', filename);
      if (document.fireEvent) {
        window.open(link.href);
      } else {
        evt = document.createEvent('MouseEvents');
        evt.initEvent('click', true, true);
        link.dispatchEvent(evt);
      }
    };
  
    window.dumpWebGLTextureData = dumpWebGLTextureData;
  })();