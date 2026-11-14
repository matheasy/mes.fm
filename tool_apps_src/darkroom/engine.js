/* MES Darkroom: WebGL2 develop engine. One fragment shader does the whole develop pipeline per output pixel, so the
   preview at any zoom and the full-size export go through exactly the same code. window.DREngine. */
(function () {
	"use strict";
	if (typeof window === "undefined") return;
	var VS = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
	var HDR = "#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 o;\n";
	/* luminance -> log2, downsampled box average: source of the blur pyramid */
	var FS_DOWN = HDR + "uniform sampler2D uT;uniform vec2 uOut;uniform vec2 uInPx;uniform int uLin;uniform int uFirst;uniform vec2 uEnc;\n" +
		"vec3 s2l(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}\n" +
		"void main(){vec2 uv=gl_FragCoord.xy/uOut;vec2 st=vec2(1.)/uOut;float acc=0.;\n" +
		"for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec2 q=uv+(vec2(float(i),float(j))-1.5)*st*.25;\n" +
		" if(uFirst==1){vec3 c=texture(uT,q).rgb;c=uLin==1?c:s2l(c);acc+=log2(max(dot(c,vec3(.2126,.7152,.0722)),1e-5));}\n" +
		" else{acc+=texture(uT,q).r*uEnc.x+uEnc.y;}}\n" +
		"acc/=16.;o=vec4((acc-uEnc.y)/uEnc.x,0.,0.,1.);}";
	var FS_BLUR = HDR + "uniform sampler2D uT;uniform vec2 uDir;uniform vec2 uOut;\n" +
		"void main(){vec2 uv=gl_FragCoord.xy/uOut;float w[7];w[0]=.1964825501511404;w[1]=.2969069646728344;w[2]=.09447039785044732;w[3]=.010381362401148057;w[4]=0.;w[5]=0.;w[6]=0.;\n" +
		"float s=texture(uT,uv).r*w[0];vec2 st=uDir/uOut;\n" +
		"s+=(texture(uT,uv+st*1.411764705882353).r+texture(uT,uv-st*1.411764705882353).r)*w[1];\n" +
		"s+=(texture(uT,uv+st*3.2941176470588234).r+texture(uT,uv-st*3.2941176470588234).r)*w[2];\n" +
		"s+=(texture(uT,uv+st*5.176470588235294).r+texture(uT,uv-st*5.176470588235294).r)*w[3];\n" +
		"o=vec4(s,0.,0.,1.);}";
	var FS_MAIN = HDR +
		"uniform sampler2D uSrc,uBlurM,uBlurL,uLut,uMask0,uMask1;uniform vec2 uEnc;uniform int uLin;uniform vec2 uSrcPx;\n" +
		"uniform mat3 uMapO;uniform mat3 uKey;uniform mat3 uOri;uniform mat3 uMapC;uniform vec2 uOriPx;uniform float uCropAsp;\n" +
		"uniform float uTemp,uTint,uExp,uCon,uHi,uSh,uWh,uBl,uTex,uCla,uDh,uVib,uSat;\n" +
		"uniform vec3 uHsl[8];uniform float uMix[8];uniform int uBW;uniform vec4 uGrade[4];uniform vec2 uGradeBB;\n" +
		"uniform float uSharp,uSRad,uSMask,uNR,uNRC,uDist,uLVig,uCA;uniform vec4 uVig;uniform vec3 uGrain;uniform int uBase;uniform float uGain;\n" +
		"uniform int uNLoc;uniform vec4 uLA[8];uniform vec4 uLB[8];uniform vec4 uLC[8];uniform vec4 uLG[8];uniform vec4 uLH[8];\n" +
		"uniform int uNSpot;uniform vec4 uSp[32];uniform vec4 uSp2[32];\n" +
		"uniform int uBefore;uniform int uClip;uniform int uShowMask;uniform vec4 uBg;\n" +
		"const vec3 LW=vec3(.2126,.7152,.0722);\n" +
		"vec3 s2l(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}\n" +
		"vec3 l2s(vec3 c){c=max(c,0.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}\n" +
		"vec3 fetch(vec2 uv){vec3 c=texture(uSrc,uv).rgb;return uLin==1?c*uGain:s2l(c);}\n" +
		"vec3 fetchCA(vec2 uv){if(abs(uCA)<.001)return fetch(uv);vec2 d=uv-.5;float k=uCA*.0012;return vec3(fetch(.5+d*(1.+k)).r,fetch(uv).g,fetch(.5+d*(1.-k)).b);}\n" +
		"float lg(){return uLin==1?log2(max(uGain,1e-6)):0.;}float bm(vec2 uv){return texture(uBlurM,uv).r*uEnc.x+uEnc.y+lg();}float blv(vec2 uv){return texture(uBlurL,uv).r*uEnc.x+uEnc.y+lg();}\n" +
		"vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}\n" +
		"vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}\n" +
		"float sCurve(float x,float c){x=clamp(x,0.,1.);if(c>=0.){float s=x*x*(3.-2.*x);return mix(x,s,c);}float inv=.5-sin(asin(clamp(1.-2.*x,-1.,1.))/3.);return mix(x,inv,-c);}\n" +
		"float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n" +
		"float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}\n" +
		"float bandW(float h,int i){float c[8];c[0]=0.;c[1]=30./360.;c[2]=60./360.;c[3]=120./360.;c[4]=180./360.;c[5]=240./360.;c[6]=280./360.;c[7]=320./360.;\n" +
		" float a=c[i],pv=i==0?c[7]-1.:c[i-1],nx=i==7?1.:c[i+1];float hh=h;if(i==0&&h>.5)hh=h-1.;if(i==7&&h<.2)hh=h+1.;\n" +
		" if(hh<a){return clamp((hh-pv)/(a-pv),0.,1.);}return clamp((nx-hh)/(nx-a),0.,1.);}\n" +
		"vec2 toSrcUV(vec3 f){vec3 op=uMapO*f;op/=op.z;vec3 k=uKey*vec3(op.xy,1.);vec2 q=k.xy/k.z;\n" +
		" if(abs(uDist)>.001){vec2 c=uOriPx*.5;vec2 d=(q-c)/length(c);float r2=dot(d,d);q=c+d*length(c)*(1.+uDist*.0025*r2);}\n" +
		" vec3 s=uOri*vec3(q,1.);return s.xy;}\n" +
		"void main(){vec3 f=vec3(gl_FragCoord.xy,1.);vec2 uv=toSrcUV(f);vec3 cu=uMapC*f;vec2 cuv=cu.xy;\n" +
		" if(cuv.x<0.||cuv.y<0.||cuv.x>1.||cuv.y>1.||uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.){o=uBg;return;}\n" +
		" vec2 px=1./uSrcPx;vec3 c=fetchCA(uv);\n" +
		" if(uBefore==1){o=vec4(uLin==1?l2s(c*.9):l2s(c),1.);return;}\n" +
		/* detail: noise reduction + sharpening from a 3x3 neighbourhood */
		" if(uSharp>0.||uNR>0.||uNRC>0.){vec2 d=px*uSRad;vec3 n[8];n[0]=fetch(uv+vec2(-d.x,0.));n[1]=fetch(uv+vec2(d.x,0.));n[2]=fetch(uv+vec2(0.,-d.y));n[3]=fetch(uv+vec2(0.,d.y));\n" +
		"  n[4]=fetch(uv+vec2(-d.x,-d.y));n[5]=fetch(uv+vec2(d.x,d.y));n[6]=fetch(uv+vec2(d.x,-d.y));n[7]=fetch(uv+vec2(-d.x,d.y));\n" +
		"  vec3 m=(n[0]+n[1]+n[2]+n[3])*.125+(n[4]+n[5]+n[6]+n[7])*.0625+c*.25;\n" +
		"  if(uNR>0.){float lc=pow(dot(c,LW),.4545);float sig=.004+uNR*.0011;vec3 acc=c;float ws=1.;for(int i=0;i<8;i++){float li=pow(dot(n[i],LW),.4545);float w=exp(-(li-lc)*(li-lc)/(2.*sig*sig))*(i<4?1.:.6);acc+=n[i]*w;ws+=w;}vec3 sm=acc/ws;c=mix(c,sm,clamp(uNR*.012,0.,1.));}\n" +
		"  if(uNRC>0.){float y=dot(c,LW);float ym=dot(m,LW)+1e-6;c=mix(c,m*(y/ym),clamp(uNRC*.009,0.,.95));}\n" +
		"  if(uSharp>0.){vec3 hp=c-m;float edge=length(n[1]-n[0])+length(n[3]-n[2]);float mk=uSMask>0.?smoothstep(uSMask*.0009,uSMask*.0009+.02,edge):1.;c=max(c+hp*uSharp*.018*mk,0.);}}\n" +
		/* healing spots (copy from another place, matched in brightness) */
		" for(int i=0;i<32;i++){if(i>=uNSpot)break;vec4 sp=uSp[i];vec2 dd=(uv-sp.xy)*uSrcPx;float r=sp.z*max(uSrcPx.x,uSrcPx.y);float dist=length(dd);if(dist<r){vec2 suv=uv+(uSp2[i].xy-sp.xy);float w=1.-smoothstep(r*(1.-sp.w*.008),r,dist);vec3 sc=fetch(suv);if(uSp2[i].z>.5){float a=exp2(bm(uv)),b=exp2(bm(suv));sc*=clamp(a/max(b,1e-5),.25,4.);}c=mix(c,sc,w);}}\n" +
		/* local adjustments: mask weights -> parameter offsets */
		" float aExp=uExp,aCon=uCon,aHi=uHi,aSh=uSh,aCla=uCla,aDh=uDh,aTemp=uTemp,aTint=uTint,aSat=uSat;float showW=0.;\n" +
		" for(int i=0;i<8;i++){if(i>=uNLoc)break;vec4 g=uLG[i];vec4 h=uLH[i];float w=0.;vec2 P=uv*uSrcPx;int t=int(uLC[i].y+.5);\n" +
		"  if(t==0){vec2 a=g.xy*uSrcPx,b=g.zw*uSrcPx;vec2 dv=b-a;float tt=dot(P-a,dv)/max(dot(dv,dv),1.);w=1.-smoothstep(0.,1.,tt);}\n" +
		"  else if(t==1){vec2 dv=P-g.xy*uSrcPx;float cs=cos(h.x),sn=sin(h.x);vec2 r=vec2(cs*dv.x+sn*dv.y,-sn*dv.x+cs*dv.y);float md=max(uSrcPx.x,uSrcPx.y);float dd=length(r/(g.zw*md));w=1.-smoothstep(max(1.-h.y,.001)*.999,1.,dd);}\n" +
		"  else{int k=int(uLC[i].w+.5);vec4 mk=k<4?texture(uMask0,uv):texture(uMask1,uv);int ch=k<4?k:k-4;w=ch==0?mk.r:ch==1?mk.g:ch==2?mk.b:mk.a;}\n" +
		"  if(uLC[i].z>.5)w=1.-w;\n" +
		"  if(uShowMask==i+1)showW=w;\n" +
		"  aExp+=w*uLA[i].x;aCon+=w*uLA[i].y;aHi+=w*uLA[i].z;aSh+=w*uLA[i].w;aCla+=w*uLB[i].x;aDh+=w*uLB[i].y;aTemp+=w*uLB[i].z;aTint+=w*uLB[i].w;aSat+=w*uLC[i].x;}\n" +
		/* white balance + exposure (linear light) */
		" float tt=aTemp*.01,gg=aTint*.01;vec3 wb=vec3(exp2(.55*tt+.12*gg),exp2(-.42*gg),exp2(-.55*tt+.12*gg));wb/=dot(wb,LW);c*=wb*exp2(aExp);\n" +
		" float B=blv(uv)+aExp;float M=bm(uv)+aExp;\n" +
		/* dehaze */
		" if(abs(aDh)>.01){float hz=aDh*.01;float bl=exp2(M);if(hz>0.){c=max(c-hz*.12*bl,0.)*(1.+hz*.35);float y=dot(c,LW);c=y+(c-y)*(1.+hz*.35);}else{c=mix(c,vec3(bl)*vec3(.93,.97,1.)+c*.3,-hz*.55);}}\n" +
		/* local tone: highlights / shadows on the big blur, clarity on the medium blur, texture from the fine detail */
		" {float y=max(dot(c,LW),1e-6);float L=log2(y);float b=B+2.47;float dL=0.;\n" +
		"  float ws=clamp(-b/4.,0.,1.);ws=ws*(2.-ws);float wh=clamp((b+1.2)/3.,0.,1.);wh=wh*wh*(3.-2.*wh);\n" +
		"  dL+=aSh*.021*ws;dL+=aHi*.022*wh;\n" +
		"  float det=L-M;float mid=exp(-pow((L+2.47)/2.6,2.));dL+=det*aCla*.009*mid;\n" +
		"  if(abs(uTex)>.01){float fine=L-log2(max(dot(fetch(uv+px*2.)+fetch(uv-px*2.)+fetch(uv+vec2(px.x,-px.y)*2.)+fetch(uv-vec2(px.x,-px.y)*2.),LW)*.25*exp2(aExp)*dot(wb,LW),1e-6));dL+=clamp(fine,-1.,1.)*uTex*.012;}\n" +
		"  c*=exp2(dL);}\n" +
		/* raw: a gentle base curve with a soft shoulder (JPEGs already have one) */
		" if(uBase==1){c=c*1.12;vec3 sh=1.-exp(-c*1.6);c=mix(c,sh/(1.-exp(-1.6)),smoothstep(.5,1.4,c));}\n" +
		" else{vec3 over=max(c-1.,0.);c=min(c,1.)+over/(1.+over);c=min(c,1.);}\n" +
		" vec3 e=l2s(c);if(uBase==1){e=vec3(sCurve(e.r,.3),sCurve(e.g,.3),sCurve(e.b,.3));}\n" +
		/* whites / blacks: ends of the range */
		" if(abs(uWh)>.01||abs(uBl)>.01){float bp=-uBl*.0011;float wp=1.-uWh*.0016;e=mix(e,(e-bp)/(wp-bp),clamp(e*e+(1.-e)*(1.-e),0.,1.));}\n" +
		/* contrast */
		" if(abs(aCon)>.01){float k=clamp(aCon*.0085,-1.,1.);e=vec3(sCurve(e.r,k),sCurve(e.g,k),sCurve(e.b,k));}\n" +
		" e=clamp(e,0.,1.);\n" +
		/* tone curve */
		" e=vec3(texture(uLut,vec2(e.r*255./256.+.5/256.,.5)).r,texture(uLut,vec2(e.g*255./256.+.5/256.,.5)).g,texture(uLut,vec2(e.b*255./256.+.5/256.,.5)).b);\n" +
		/* colour mixer */
		" vec3 hsv=rgb2hsv(e);float dh=0.,ds=0.,dl=0.,mx=0.;for(int i=0;i<8;i++){float w=bandW(hsv.x,i);dh+=w*uHsl[i].x;ds+=w*uHsl[i].y;dl+=w*uHsl[i].z;mx+=w*uMix[i];}\n" +
		" if(uBW==0){hsv.x=fract(hsv.x+dh*.0009);hsv.y=clamp(hsv.y*(1.+ds*.01),0.,1.);vec3 e2=hsv2rgb(hsv);float y0=dot(e2,LW);float lf=exp2(dl*.012*hsv.y);e=e2*lf;\n" +
		"  float y=dot(e,LW);float sat=hsv.y;float vb=aSat*.01;float vv=uVib*.01;float skin=1.-smoothstep(.02,.12,abs(hsv.x-.07))*.5;\n" +
		"  float k=1.+vb+vv*(1.-sat)*(vv>0.?skin:1.);e=max(y+(e-y)*k,0.);}\n" +
		" else{float y=dot(e,LW);y*=exp2(mx*.016*hsv.y);e=vec3(clamp(y,0.,1.));}\n" +
		/* colour grading: shadows / midtones / highlights / global */
		" {float y=clamp(dot(e,LW),0.,1.);float bal=uGradeBB.y*.005;float bl=.2+uGradeBB.x*.006;\n" +
		"  float wS=1.-smoothstep(.0,.5+bal+bl*.5,y);float wH=smoothstep(.5+bal-bl*.5,1.,y);float wM=clamp(1.-wS-wH,0.,1.);\n" +
		"  for(int i=0;i<4;i++){vec4 g=uGrade[i];if(g.y<.01&&abs(g.z)<.01)continue;float w=i==0?wS:i==1?wM:i==2?wH:1.;vec3 tc=hsv2rgb(vec3(g.x/360.,1.,1.));tc-=dot(tc,LW);e+=tc*g.y*.0045*w;e+=g.z*.0018*w;}}\n" +
		" e=clamp(e,0.,1.);\n" +
		/* lens vignetting correction (on the whole frame) and post-crop vignette */
		" if(abs(uLVig)>.01){vec2 d=(uv-.5)*2.;float r2=dot(d,d)*.5;e=clamp(e*(1.+uLVig*.008*r2),0.,1.);}\n" +
		" if(abs(uVig.x)>.01){vec2 d=(cuv-.5)*2.;float rnd=(uVig.w+100.)*.005;d=mix(d,d*vec2(uCropAsp,1.)/sqrt(uCropAsp),rnd);\n" +
		"  float r=length(d)/1.4142;float mid=mix(.95,.15,uVig.y*.01);float fe=max(uVig.z*.01,.02);float w=smoothstep(mid-fe*.5,mid+fe*.5,r);\n" +
		"  if(uVig.x<0.)e*=1.+uVig.x*.01*w*1.1;else e=mix(e,vec3(1.),uVig.x*.01*w*.9);e=clamp(e,0.,1.);}\n" +
		/* grain */
		" if(uGrain.x>.01){vec2 gp=cuv*vec2(uCropAsp,1.)*mix(2600.,500.,uGrain.y*.01);float n=mix(vnoise(gp),hash(gp),uGrain.z*.01)-.5;float y=dot(e,LW);e=clamp(e+n*uGrain.x*.0028*(1.-abs(2.*y-1.)*.6),0.,1.);}\n" +
		" if(uClip==1){if(max(e.r,max(e.g,e.b))>=.996)e=vec3(1.,.15,.15);else if(max(e.r,max(e.g,e.b))<=.004)e=vec3(.15,.35,1.);}\n" +
		" if(uShowMask>0)e=mix(e,vec3(1.,.15,.2),showW*.55);\n" +
		" o=vec4(e,1.);}";

	function mat3Inv(m) { /* column-major 3x3 */
		var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
		var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (!det) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
		var k = 1 / det; return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
	}
	function mul(A, B) { var r = []; for (var col = 0; col < 3; col++) for (var row = 0; row < 3; row++) { var s = 0; for (var k = 0; k < 3; k++) s += A[k * 3 + row] * B[col * 3 + k]; r[col * 3 + row] = s; } return r; }
	function T(x, y) { return [1, 0, 0, 0, 1, 0, x, y, 1]; }
	function Sc(x, y) { return [x, 0, 0, 0, y, 0, 0, 0, 1]; }
	function R(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; }
	function apply(M, x, y) { var X = M[0] * x + M[3] * y + M[6], Y = M[1] * x + M[4] * y + M[7], Z = M[2] * x + M[5] * y + M[8]; return [X / Z, Y / Z]; }
	/* homography that maps unit square corners to quad corners (Heckbert) */
	function squareToQuad(q) {
		var x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3], x2 = q[4], y2 = q[5], x3 = q[6], y3 = q[7];
		var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
		var g, h, den = dx1 * dy2 - dx2 * dy1;
		if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) { g = 0; h = 0; } else { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
		var a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
		return [a, d, g, b, e, h, c, f, 1];
	}

	/* geometry for a photo: oriented size, crop, maps. W, H = source pixels */
	function geometry(s, W, H) {
		var os = MESDR.orientedSize(W, H, s.rot90), OW = os[0], OH = os[1];
		/* oriented px -> source uv */
		var ori = Sc(1 / W, 1 / H);
		var turn = [T(0, 0), mul(T(W, 0), R(Math.PI / 2)), mul(T(W, H), R(Math.PI)), mul(T(0, H), R(-Math.PI / 2))][s.rot90];
		/* turn maps oriented px -> source px for each rotation */
		var o2s = turn;
		if (s.rot90 === 1) o2s = [0, 1, 0, -1, 0, 0, W, 0, 1];
		else if (s.rot90 === 2) o2s = [-1, 0, 0, 0, -1, 0, W, H, 1];
		else if (s.rot90 === 3) o2s = [0, -1, 0, 1, 0, 0, 0, H, 1];
		else o2s = [1, 0, 0, 0, 1, 0, 0, 0, 1];
		var flip = mul(T(s.flipH ? OW : 0, s.flipV ? OH : 0), Sc(s.flipH ? -1 : 1, s.flipV ? -1 : 1));
		ori = mul(ori, mul(o2s, flip));
		/* keystone: vertical / horizontal perspective as a homography on oriented px */
		var kv = s.keyV * 0.0025, kh = s.keyH * 0.0025, key = [1, 0, 0, 0, 1, 0, 0, 0, 1];
		if (kv || kh) {
			var q = [0, 0, OW, 0, OW, OH, 0, OH];
			q[0] += OW * Math.max(kv, 0); q[2] -= OW * Math.max(kv, 0); q[4] -= OW * Math.max(-kv, 0); q[6] += OW * Math.max(-kv, 0);
			q[1] += OH * Math.max(kh, 0); q[7] -= OH * Math.max(kh, 0); q[3] += OH * Math.max(-kh, 0); q[5] -= OH * Math.max(-kh, 0);
			var Hm = squareToQuad(q); key = mul(Hm, Sc(1 / OW, 1 / OH));
		}
		/* crop: output px (0..cw, 0..ch, y down) -> oriented px */
		var c = s.crop, cw = c.w * OW, ch = c.h * OH, cx = (c.x + c.w / 2) * OW, cy = (c.y + c.h / 2) * OH;
		var crop = mul(T(cx, cy), mul(R(s.angle * Math.PI / 180), T(-cw / 2, -ch / 2)));
		return { W: W, H: H, OW: OW, OH: OH, cw: cw, ch: ch, ori: ori, key: key, crop: crop, inv: function (x, y) { /* output px -> source uv (no keystone / distortion) */ var p = apply(crop, x, y); p = apply(key, p[0], p[1]); return apply(ori, p[0], p[1]); } };
	}

	function Engine(canvas, opts) {
		opts = opts || {};
		var gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, antialias: false, alpha: false });
		if (!gl) throw new Error("WebGL2 is not available in this browser.");
		this.gl = gl; this.canvas = canvas; this.floatOK = !!gl.getExtension("EXT_color_buffer_float"); gl.getExtension("OES_texture_float_linear");
		this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		var self = this;
		function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Shader: " + gl.getShaderInfoLog(s)); return s; }
		function prog(fs) { var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Link: " + gl.getProgramInfoLog(p)); var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, ""); u[nm] = gl.getUniformLocation(p, info.name); } return { p: p, u: u }; }
		this.pDown = prog(FS_DOWN); this.pBlur = prog(FS_BLUR); this.pMain = prog(FS_MAIN);
		var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		var vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); this.vao = vao;
		this.lut = this.tex(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, true);
		this.blank = this.tex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]), true);
		this.masks = [this.blank, this.blank]; this.lutKey = ""; this.src = null; this.enc = this.floatOK ? [1, 0] : [28, -20];
		canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); self.lost = true; if (opts.onLost) opts.onLost(); });
	}
	Engine.prototype.tex = function (w, h, ifmt, fmt, type, data, linear) {
		var gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
		var f = linear === false ? gl.NEAREST : gl.LINEAR; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t;
	};
	Engine.prototype.target = function (w, h) {
		var gl = this.gl, t = this.floatOK ? this.tex(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT, null) : this.tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null);
		var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
		return { t: t, fb: fb, w: w, h: h };
	};
	Engine.prototype.drop = function () { var gl = this.gl; (this.tmp || []).forEach(function (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.fb); }); this.tmp = []; if (this.src) gl.deleteTexture(this.src); this.src = null; };
	/* img: ImageBitmap / canvas / ImageData (sRGB) or {w, h, half: Uint16Array (RGB half floats, linear), gain} */
	Engine.prototype.setImage = function (img) {
		var gl = this.gl; this.drop();
		if (img && img.half) { this.src = this.tex(img.w, img.h, gl.RGB16F, gl.RGB, gl.HALF_FLOAT, img.half); this.W = img.w; this.H = img.h; this.lin = 1; this.gain = img.gain || 1; }
		else { var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.src = t; this.W = img.width; this.H = img.height; this.lin = 0; this.gain = 1; }
		/* blur pyramid: 1/4 size (max 1024) and 1/16 (max 160) of log luminance */
		var self = this, W = this.W, H = this.H;
		function sz(max, div) { var k = Math.min(1 / div, max / Math.max(W, H)); return [Math.max(2, Math.round(W * k)), Math.max(2, Math.round(H * k))]; }
		var m1 = sz(1024, 4), m2 = sz(160, 16);
		function down(srcTex, first, dst, inW, inH) { var p = self.pDown; gl.useProgram(p.p); gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); gl.uniform1i(p.u.uT, 0); gl.uniform2f(p.u.uOut, dst.w, dst.h); gl.uniform2f(p.u.uInPx, inW, inH); gl.uniform1i(p.u.uLin, self.lin); gl.uniform1i(p.u.uFirst, first ? 1 : 0); gl.uniform2f(p.u.uEnc, self.enc[0], self.enc[1]); gl.bindVertexArray(self.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
		function blur(a, b, passes) { var p = self.pBlur; gl.useProgram(p.p); for (var i = 0; i < passes; i++) { [[a, b, 1, 0], [b, a, 0, 1]].forEach(function (s) { gl.bindFramebuffer(gl.FRAMEBUFFER, s[1].fb); gl.viewport(0, 0, s[1].w, s[1].h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s[0].t); gl.uniform1i(p.u.uT, 0); gl.uniform2f(p.u.uDir, s[2], s[3]); gl.uniform2f(p.u.uOut, s[1].w, s[1].h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }); } }
		/* the first pass reads the big source in steps; do it via an intermediate at 4x the 1/4 target when the picture is huge */
		var a1 = this.target(m1[0], m1[1]), b1 = this.target(m1[0], m1[1]), a2 = this.target(m2[0], m2[1]), b2 = this.target(m2[0], m2[1]);
		this.tmp = [a1, b1, a2, b2];
		var step = Math.max(W / m1[0], H / m1[1]);
		if (step > 6) { var mid = this.target(Math.round(m1[0] * 2), Math.round(m1[1] * 2)); this.tmp.push(mid); down(this.src, true, mid, W, H); down(mid.t, false, a1, mid.w, mid.h); } else down(this.src, true, a1, W, H);
		blur(a1, b1, 2); down(a1.t, false, a2, a1.w, a1.h); blur(a2, b2, 3);
		this.blurM = a1.t; this.blurL = a2.t;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};
	Engine.prototype.setMask = function (i, source) { var gl = this.gl; if (this.masks[i] && this.masks[i] !== this.blank) gl.deleteTexture(this.masks[i]); if (!source) { this.masks[i] = this.blank; return; } var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this.masks[i] = t; };
	/* view: {outW, outH (target px), map: 3x3 column-major from target px (y down) to cropped-output px} */
	Engine.prototype.draw = function (s, view, o) {
		o = o || {}; var gl = this.gl; if (!this.src) return;
		var p = this.pMain, u = p.u; gl.useProgram(p.p);
		var g = geometry(s, this.W, this.H);
		/* gl_FragCoord has y up: flip into target px (y down), then view map, then crop */
		var flipY = [1, 0, 0, 0, -1, 0, 0, view.outH, 1];
		var toOut = mul(view.map, flipY), mapO = mul(g.crop, toOut), mapC = mul(Sc(1 / g.cw, 1 / g.ch), toOut);
		gl.uniformMatrix3fv(u.uMapO, false, mapO); gl.uniformMatrix3fv(u.uKey, false, g.key); gl.uniformMatrix3fv(u.uOri, false, g.ori); gl.uniformMatrix3fv(u.uMapC, false, mapC);
		gl.uniform2f(u.uOriPx, g.OW, g.OH); gl.uniform1f(u.uCropAsp, g.cw / g.ch); gl.uniform2f(u.uSrcPx, this.W, this.H); gl.uniform1i(u.uLin, this.lin); gl.uniform1f(u.uGain, this.gain || 1); gl.uniform2f(u.uEnc, this.enc[0], this.enc[1]);
		var lk = JSON.stringify(s.curve); if (lk !== this.lutKey) { gl.bindTexture(gl.TEXTURE_2D, this.lut); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, MESDR.curveLUT(s.curve)); this.lutKey = lk; }
		var tex = [[u.uSrc, this.src], [u.uBlurM, this.blurM], [u.uBlurL, this.blurL], [u.uLut, this.lut], [u.uMask0, this.masks[0]], [u.uMask1, this.masks[1]]];
		tex.forEach(function (t, i) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t[1]); gl.uniform1i(t[0], i); });
		var f1 = function (n, v) { gl.uniform1f(u[n], v); };
		f1("uTemp", s.temp); f1("uTint", s.tint); f1("uExp", s.exposure); f1("uCon", s.contrast); f1("uHi", s.highlights); f1("uSh", s.shadows); f1("uWh", s.whites); f1("uBl", s.blacks);
		f1("uTex", s.texture); f1("uCla", s.clarity); f1("uDh", s.dehaze); f1("uVib", s.vibrance); f1("uSat", s.saturation);
		var hsl = []; for (var i = 0; i < 8; i++) hsl.push(s.hue[i], s.sat[i], s.lum[i]); gl.uniform3fv(u.uHsl, hsl); gl.uniform1fv(u.uMix, s.mix); gl.uniform1i(u.uBW, s.bw ? 1 : 0);
		var gr = s.grade; gl.uniform4fv(u.uGrade, [].concat(gr.sh, [0], gr.mid, [0], gr.hi, [0], gr.glob, [0])); gl.uniform2f(u.uGradeBB, gr.blend - 50, gr.balance);
		var scale = o.detailScale || 1; /* sharpening radius in source px */
		f1("uSharp", s.sharpen); f1("uSRad", s.sRadius); f1("uSMask", s.sMask); f1("uNR", s.nr); f1("uNRC", s.nrColor); f1("uDist", s.dist); f1("uLVig", s.lensVig); f1("uCA", s.ca);
		gl.uniform4f(u.uVig, s.vig, s.vigMid, s.vigFeather, s.vigRound); gl.uniform3f(u.uGrain, s.grain, s.grainSize, s.grainRough); gl.uniform1i(u.uBase, this.lin ? 1 : 0);
		var L = s.locals.filter(function (l) { return l.on; }), LA = [], LB = [], LC = [], LG = [], LH = [], bi = 0;
		L.forEach(function (l) { var a = l.adj; LA.push(a.exp, a.con, a.hi, a.sh); LB.push(a.cla, a.dh, a.temp, a.tint);
			var t = l.type === "linear" ? 0 : l.type === "radial" ? 1 : 2, bidx = t === 2 ? (l._slot != null ? l._slot : bi++) : 0;
			LC.push(a.sat, t, l.inv ? 1 : 0, bidx);
			if (t === 0) { LG.push(l.x0, l.y0, l.x1, l.y1); LH.push(0, 0, 0, 0); } else if (t === 1) { LG.push(l.cx, l.cy, l.rx, l.ry); LH.push(l.rot, l.feather / 100, 0, 0); } else { LG.push(0, 0, 0, 0); LH.push(0, 0, 0, 0); } });
		while (LA.length < 32) { LA.push(0); LB.push(0); LC.push(0); LG.push(0); LH.push(0); }
		gl.uniform1i(u.uNLoc, L.length); gl.uniform4fv(u.uLA, LA); gl.uniform4fv(u.uLB, LB); gl.uniform4fv(u.uLC, LC); gl.uniform4fv(u.uLG, LG); gl.uniform4fv(u.uLH, LH);
		var sp = [], sp2 = []; s.spots.forEach(function (q) { sp.push(q.x, q.y, q.r, q.f); sp2.push(q.sx, q.sy, q.heal ? 1 : 0, 0); }); while (sp.length < 128) { sp.push(0); sp2.push(0); }
		gl.uniform1i(u.uNSpot, s.spots.length); gl.uniform4fv(u.uSp, sp); gl.uniform4fv(u.uSp2, sp2);
		gl.uniform1i(u.uBefore, o.before ? 1 : 0); gl.uniform1i(u.uClip, o.clip ? 1 : 0); gl.uniform1i(u.uShowMask, o.showMask || 0);
		var bg = o.bg || [0, 0, 0, 1]; gl.uniform4f(u.uBg, bg[0], bg[1], bg[2], bg[3]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, o.fb || null); gl.viewport(o.vx || 0, o.vy || 0, view.outW, view.outH);
		gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		return g;
	};
	/* render the whole cropped picture at outW x outH into a 2D canvas (tiles, so any size the canvas allows works) */
	Engine.prototype.renderTo = function (s, outW, outH, o) {
		o = o || {}; var gl = this.gl, g = geometry(s, this.W, this.H), tile = Math.min(2048, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
		var out = o.canvas || document.createElement("canvas"); out.width = outW; out.height = outH; var ctx = out.getContext("2d");
		var rt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, rt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tile, tile, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);
		var buf = new Uint8Array(tile * tile * 4), kx = g.cw / outW, ky = g.ch / outH;
		for (var ty = 0; ty < outH; ty += tile) for (var tx = 0; tx < outW; tx += tile) {
			var w = Math.min(tile, outW - tx), h = Math.min(tile, outH - ty);
			/* target px (y down, inside the tile) -> output px */
			var map = mul(Sc(kx, ky), T(tx, ty));
			this.draw(s, { outW: w, outH: h, map: map }, { fb: fb, before: o.before });
			gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
			var id = ctx.createImageData(w, h), d = id.data;
			for (var y = 0; y < h; y++) { var srcRow = (h - 1 - y) * w * 4; d.set(buf.subarray(srcRow, srcRow + w * 4), y * w * 4); }
			ctx.putImageData(id, tx, ty);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(rt);
		return out;
	};
	/* small rendering's pixels (for the histogram / auto) */
	Engine.prototype.pixels = function (s, maxSide, o) {
		var gl = this.gl, g = geometry(s, this.W, this.H), k = Math.min(1, maxSide / Math.max(g.cw, g.ch)), w = Math.max(1, Math.round(g.cw * k)), h = Math.max(1, Math.round(g.ch * k));
		if (!this._px || this._px.w !== w || this._px.h !== h) { if (this._px) { gl.deleteFramebuffer(this._px.fb); gl.deleteTexture(this._px.t); } var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); this._px = { w: w, h: h, t: t, fb: fb, buf: new Uint8Array(w * h * 4) }; }
		this.draw(s, { outW: w, outH: h, map: Sc(g.cw / w, g.ch / h) }, Object.assign({ fb: this._px.fb }, o || {}));
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this._px.buf); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return { w: w, h: h, data: this._px.buf };
	};
	/* the linear colour of a source pixel before any adjustment (white balance picker) */
	Engine.prototype.sampleSource = function (u, v, s) {
		var gl = this.gl, n = 5, out = [0, 0, 0], d = defaults0(); d.rot90 = 0; d.crop = { x: 0, y: 0, w: 1, h: 1 };
		var px = this.pixels(Object.assign(d, { crop: { x: MESDR.clamp(u - 0.004, 0, 0.99), y: MESDR.clamp(v - 0.004, 0, 0.99), w: 0.008, h: 0.008 } }), n, { before: true });
		var c = 0; for (var i = 0; i < px.data.length; i += 4) { out[0] += px.data[i]; out[1] += px.data[i + 1]; out[2] += px.data[i + 2]; c++; }
		return out.map(function (x) { var e = x / c / 255; e = e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4); return e; });
	};
	function defaults0() { return MESDR.defaults(); }
	Engine.prototype.destroy = function () { this.drop(); var ext = this.gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); };
	window.DREngine = Engine; window.DRGeo = { geometry: geometry, mul: mul, T: T, Sc: Sc, R: R, inv: mat3Inv, apply: apply };
})();
