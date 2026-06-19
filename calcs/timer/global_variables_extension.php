<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://timer.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://timer.mes.fm'.$this->uri,
            'local_root' => 'timer',
            'tag_manager' => 'GTM-PDDGRDZ',
            'calc_name' => 'Timer',
            'dark_color' => '#f69b14',
            'light_color' => '#ffebcf',
            'highlight_color' => '#e08d12',
            'fb_id' => '1180556328628368',
            'og_type' => 'website',
            'og_title' => 'Timer by Math Easy Solutions',
            'og_description' => 'This is an online timer website that has a countdown timer, alarm clock, and stopwatch that also shows up in the browser tab!',
            'contact_email' => 'timer@mes.fm',
            'ga_id' => 'UA-18189318-16',
            'url_short' => 'timer.mes.fm',
            'policy_date_modified' => 'Sept 1, 2015',
            'tag_line' => 'Online timer, stopwatch, alarm clock and inspirational quotes!',
            'memes_dir' => 'inspirational-quotes',
            'addthis_id' => 'ra-55f7c294cf920d52',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'contact_email' => 'timer@mes.fm',
            'disqus_url' => 'timermes',
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'subscribe_data' => array(
                'url' => 'https://mes.us13.list-manage.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=baccf9fed7',
                'form' => '//mes.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=baccf9fed7',
                'id' => 'baccf9fed7'
                ),
            'ad_id' => array(
                'resp_horiz' => '6994340066',
                'resp_rect' => '1168132465',
                'resp_vert' => '7354266860',
                'link1' => '7295391266', // 200x90 #1
                'link2' => '8632523660', // 200x90 #2
                'link3' => '8492922865', // 728x15
                //'anchor' => '3152217267',
                'm_link3' => '2306788461'
                ),
            'social_medias' => array(
                'fb' => 'mestimer',
                'twitter' => 'timermes',
                'insta' => 'timermes',
                'gplus' => '108768583229768838911',
                'pin' => 'timermes'
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'inspirational-quotes',
                    'label'=>'Inspirational Quotes'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'inspirational-quotes',
                    'label'=>'Inspirational Quotes'
                    )
                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>