<section id="intro">
								
									<div>
										<div class="row">
											<div class="2u">
												<section class="first">
													Latest
												</section>
											</div>
											<div class="2u">
												<section class="first">
													Prev
												</section>
											</div>
											<div class="2u">
												<section class="middle">
													<a id="random_url"  title="Shortcut: '/'" href="<?php echo $comic_random_url?>">Random</a>
												</section>
											</div>
											<div class="2u">
												<section class="last">
													<a id="next_url" href="<?php echo $nextUrl?>" title="Shortcut: Right Arrow">Next</a>
												</section>
											</div>
											<div class="2u">
												<section class="last">
													<a href="<?php echo $firstUrl?>">First</a>
												</section>
											</div>

										</div>
									</div>
	</section>
<section id="banner">

	<a href="<?php echo $nextUrl?>">
		<span class="image image-full"><img src="/media/comics/full/<?php echo $comic_url ?>" alt="<?php echo $comic_title?>"></span>
	</a>
	<h2 class="comic-header"><?php echo $comic_title?></h2>
	<p class="comic-desc"> <?php echo $comic_description?></p>
</section>
<div style="width:100%; overflow:hidden;">
<div class="facebook-comment">
	<div class="fb-comments" data-href="<?php echo $_SERVER['SERVER_NAME'] . $_SERVER['REQUEST_URI'] ?>" data-numposts="5" data-colorscheme="light"></div>
</div>
<!--<div class="right-ad">
<script async src="//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script> <!- CCC Box Ad 1 - 300x250 -> <ins class="adsbygoogle"      style="display:inline-block;width:300px;height:250px"      data-ad-client="ca-pub-1461238060884369"      data-ad-slot="1458340469"></ins> <script> (adsbygoogle = window.adsbygoogle || []).push({}); </script>
<script async src="//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script> <!- CCC Tall Ad 2 - 300x600 -> <ins class="adsbygoogle"      style="display:inline-block;width:300px;height:600px"      data-ad-client="ca-pub-1461238060884369"      data-ad-slot="7365273267"></ins> <script> (adsbygoogle = window.adsbygoogle || []).push({}); </script>
</div>-->
</div>