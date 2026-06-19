<?php defined('SYSPATH') or die('No direct script access.');

class Routes_Comics extends Route {
	public static function add_all_routes() {


Route::set('archive', "(archives/archive/)<comic_slug>")
		->defaults(array(
		'controller' => 'comics',
		'action'     => 'archive',
		));
/*	Route::set('archive1', "<comic_slug>")
		->defaults(array(
		'controller' => 'comics',
		'action'     => 'archive',
		));
		*/
		

		Route::set('default', '(<controller>(/<action>(/<id>)))')
	->defaults(array(
		'controller' => 'comics',
		'action'     => 'index',
	));

		
		
		
	}
}
?>