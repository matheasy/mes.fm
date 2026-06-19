<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://speedreader.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://speedreader.mes.fm'.$this->uri,
            'local_root' => 'speedreader',
            'tag_manager' => 'GTM-PL6QNQR',
            'calc_name' => 'Speed Reader',
            'dark_color' => '#fc320e',
            'light_color' => '#fdc010',
            'highlight_color' => '#db1d0f',
            'fb_id' => '',
            'og_type' => 'website',
            'og_title' => 'Speed Reader by Math Easy Solutions',
            'og_description' => 'Master the craft of speed reading! By staring at one spot instead of scanning sentences from left to right, your eyes can read words at a higher rate. Slowly increase the words per minute value as you get faster and faster at reading. Can you reach the 1000 words per minute mark?',
            'ga_id' => 'UA-18189318-23',
            'url_short' => 'speedreader.mes.fm',
            'policy_date_modified' => 'July 10th, 2017',
            'tag_line' => 'Increase your reading speed!',
            'show_ads' => $this->localhost ? false : true,
            'contact_email' => 'contact@mes.fm',
            'disqus_url' => 'speedreader-1',
            /*'subscribe_data' => array(
                'url' => '',
                'form' => '',
                'id' => ''
                ),*/
            'ad_id' => array(
                'resp_horiz' => '8275089190',
                'resp_rect' => '8139836751',
                'resp_vert' => '7533154487',
                ),/*
            'social_medias' => array(
                'fb' => '',
                'twitter' => '',
                'insta' => '',
                'gplus' => '',
                'pin' => ''
                ),*/
            /*'navbar' => array(
                array(
                    'url'=>$this->root_domain.'',
                    'label'=>''
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'',
                    'label'=>''
                    )
                )*/
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>