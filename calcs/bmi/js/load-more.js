$(document).ready(function(){
	var LOADMORE = (function() {
		return {
			nextUrl: nextUrl,
			
			loadMore: function() {
				$.ajax({
					url: LOADMORE.nextUrl,
					type: "GET",
					dataType: "jsonp",
					cache: false
				})
					.done(function(data) {
						$.each(data.data, function(i, d) {
							var c = d.caption.text;
							var imgAlt = c.replace(/([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g, '');
							var imgLink = d.link;
							var imgLink = imgLink.split("/");
							var imgLink = "//bmicalculator.mes.fm/social-media/instagram/"+imgLink[4];
							var imgSrc = d.images.standard_resolution.url;
							$("#thumbnails").append("<a href="+imgLink+"><img src="+imgSrc+" alt='"+imgAlt+"' width='150' height='150'></a>");
						});
						LOADMORE.nextUrl = data.pagination.next_url;
						if(!LOADMORE.nextUrl)
							$("#load-more-button").css("display","none");
					});
			}
		}
	})();

	$("#load-more-button").click(function() {
		LOADMORE.loadMore();
	});
});