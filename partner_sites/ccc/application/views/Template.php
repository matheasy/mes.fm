<html>
<head>
	<title><?php echo $comic_title; ?> | Chin Chat Comics</title>
	<?php foreach ($styles as $style => $media): 
	echo HTML::style($style, array('media' => $media), TRUE), "\n" ?>
<?php endforeach; ?>
<script type="text/javascript" src="https://ws.sharethis.com/button/buttons.js"></script>
<script type="text/javascript">stLight.options({publisher: "2d2daea2-781e-40c1-b272-200c847e15c8", doNotHash: false, doNotCopy: false, hashAddressBar: false});</script>

<meta property="og:title" content="<?php echo $comic_title; ?>" />
<meta property="og:description" content="<?php echo $comic_description; ?>" />
<meta property="og:url" content="http://chinchatcomics.mes.fm/<?php echo $comic_slug; ?>/" />
<meta property="og:image" content="http://chinchatcomics.mes.fm/media/comics/full/<?php echo $comic_url; ?>" />

</head>
<body class="homepage">
	<div id="fb-root"></div>
<script>(function(d, s, id) {
  var js, fjs = d.getElementsByTagName(s)[0];
  if (d.getElementById(id)) return;
  js = d.createElement(s); js.id = id;
  js.src = "//connect.facebook.net/en_US/sdk.js#xfbml=1&appId=746139902103211&version=v2.0";
  fjs.parentNode.insertBefore(js, fjs);
}(document, 'script', 'facebook-jssdk'));</script>
	<!-- Header Wrapper -->
	<div id="header-wrapper">
		<div class="container">
			<div class="row">
				<div class="12u">

					<!-- Header -->
					<?php echo $header ?>
				</div>
			</div>
			<?php echo $content ?>
		
		</div>
		<?php echo $footer ?>
	</div>

	<?php foreach ($scripts as $script => $media): 
	echo html::script($script, array('media' => $media), TRUE), "\n" ?>
<?php endforeach; ?>

	<script>
	function leftArrowPressed() {



	if ($('#prev_url')) location.href = $('#prev_url').attr("href");

	}

	function rightArrowPressed() {
   
   if ($('#next_url')) location.href = $('#next_url').attr("href");
	}

	function backslashPressed(){
		if ($('#random_url')) location.href = $('#random_url').attr("href");
	}

document.onkeydown = function(evt) {
    evt = evt || window.event;
    switch (evt.keyCode) {
        case 37:
            leftArrowPressed();
            break;
        case 39:
            rightArrowPressed();
            break;
        case 191:
        	backslashPressed();
    }
};
	</script>
	
	<script>
  (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');

  ga('create', 'UA-13298661-2', 'chinchatcomics.mes.fm');
  ga('send', 'pageview');

</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
</body>   
</html>